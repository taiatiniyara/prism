import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateText, stepCountIs } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { createAiTools } from "./tools";
import { getSystemPrompt, getPromptVersion } from "./prompt";
import { validateInput, filterOutput } from "./guardrails";
import { checkRateLimit, recordRequest, recordError, acquireConcurrencySlot, releaseConcurrencySlot } from "./rate-limit";
import { AI_MODELS, AI_RATE_LIMITS, type AiChatMessage } from "./types";

interface AiServiceOptions {
  messages: AiChatMessage[];
  user: CurrentUser;
  sessionId?: number;
  maxHistoryTurns?: number;
  systemPromptOverride?: string;
  onFinish?: (info: {
    text: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls: Array<{ toolName: string; input: unknown }>;
    model: string;
    wasFallback: boolean;
    promptVersion: string;
  }) => Promise<void>;
}

interface AiStreamResult {
  stream: ReturnType<typeof streamText>["textStream"];
  fullStream: ReturnType<typeof streamText>["fullStream"];
  model: string;
  wasFallback: boolean;
  promptVersion: string;
}

const APPROX_CHARS_PER_TOKEN = 4;
const MAX_INPUT_TOKENS = 20000;

const prepareMessages = (
  messages: AiChatMessage[],
  maxHistoryTurns: number,
): AiChatMessage[] => {
  const maxMessages = maxHistoryTurns * 2;
  const recentMessages = messages.slice(-maxMessages);

  let totalChars = 0;
  const trimmed: AiChatMessage[] = [];
  for (const msg of recentMessages) {
    const content = typeof msg.content === "string" ? msg.content : "";
    const cleaned = content.trim();
    if (!cleaned) continue;
    totalChars += cleaned.length;
    trimmed.push({ role: msg.role, content: cleaned });
    if (totalChars / APPROX_CHARS_PER_TOKEN > MAX_INPUT_TOKENS) break;
  }

  return trimmed;
};

const isThinkingModel = (modelName: string): boolean =>
  /^claude-sonnet-4/i.test(modelName);

const getModelConfig = (degradedMode: boolean) => {
  const modelName = degradedMode ? AI_MODELS.fallback : AI_MODELS.primary;

  const baseConfig = {
    model: anthropic(modelName),
    modelName,
    maxOutputTokens: isThinkingModel(modelName) ? 8000 : 2500,
    temperature: degradedMode ? 0.3 : 0.4,
  };

  return {
    ...baseConfig,
    providerOptions: isThinkingModel(modelName)
      ? { anthropic: { thinking: { type: "enabled" as const, budgetTokens: 12000 } } }
      : undefined,
  };
};

export const runAiStream = async (
  options: AiServiceOptions,
): Promise<AiStreamResult> => {
  const { messages, user, maxHistoryTurns = AI_RATE_LIMITS.max_history_turns, systemPromptOverride, onFinish } =
    options;

  const lastUserMessage = messages.filter((m) => m.role === "user").pop();

  if (!lastUserMessage || typeof lastUserMessage.content !== "string") {
    throw new Error("No user message found");
  }

  const inputValidation = validateInput(lastUserMessage.content);
  if (!inputValidation.passed) {
    throw new Error(`GUARDRAIL:${inputValidation.reason}`);
  }

  const rateLimitInfo = await checkRateLimit(user.id);
  if (!rateLimitInfo.allowed) {
    throw new Error(
      "RATE_LIMIT:You have exceeded your rate limit. Please try again later.",
    );
  }

  let slotReleased = false;
  acquireConcurrencySlot(user.id);

  const preparedMessages = prepareMessages(messages, maxHistoryTurns);
  const tools = createAiTools(user);
  const systemPrompt = systemPromptOverride ?? getSystemPrompt();
  const promptVersion = getPromptVersion();

  const config = getModelConfig(rateLimitInfo.degraded_mode);

  const releaseOnce = () => {
    if (!slotReleased) {
      slotReleased = true;
      releaseConcurrencySlot(user.id);
    }
  };

  const buildOnFinish = (modelName: string, isFallback: boolean) =>
    async (finish: { text: string; usage?: { inputTokens?: number; outputTokens?: number }; toolCalls: Array<{ toolName: string; input: unknown }> }) => {
      releaseOnce();
      try {
        const tokenCount = (finish.usage?.inputTokens ?? 0) + (finish.usage?.outputTokens ?? 0);
        await recordRequest(user.id, tokenCount);
      } catch {
        // best-effort
      }
      if (onFinish) {
        try {
          await onFinish({
            text: finish.text,
            usage: { inputTokens: finish.usage?.inputTokens ?? 0, outputTokens: finish.usage?.outputTokens ?? 0 },
            toolCalls: finish.toolCalls.map((tc) => ({ toolName: tc.toolName, input: tc.input })),
            model: modelName,
            wasFallback: isFallback,
            promptVersion,
          });
        } catch (err) {
          console.error("[ai-service] onFinish callback failed:", err instanceof Error ? err.message : String(err));
        }
      }
    };

  const doStream = async () => {
    return streamText({
      model: config.model,
      system: systemPrompt,
      messages: preparedMessages,
      tools,
      maxOutputTokens: config.maxOutputTokens,
      stopWhen: stepCountIs(10),
      temperature: config.temperature,
      ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
      onFinish: buildOnFinish(config.modelName, rateLimitInfo.degraded_mode),
    });
  };

  try {
    const result = await doStream();

    return {
      stream: result.textStream,
      fullStream: result.fullStream,
      model: config.modelName,
      wasFallback: rateLimitInfo.degraded_mode,
      promptVersion,
    };
  } catch (error) {
    releaseOnce();

    if (!rateLimitInfo.degraded_mode) {
      try {
        const fallbackConfig = getModelConfig(true);

        const result = streamText({
          model: fallbackConfig.model,
          system: systemPrompt,
          messages: preparedMessages,
          tools,
          maxOutputTokens: fallbackConfig.maxOutputTokens,
          stopWhen: stepCountIs(10),
          temperature: fallbackConfig.temperature,
          ...(fallbackConfig.providerOptions ? { providerOptions: fallbackConfig.providerOptions } : {}),
          onFinish: buildOnFinish(fallbackConfig.modelName, true),
        });

        return {
          stream: result.textStream,
          fullStream: result.fullStream,
          model: fallbackConfig.modelName,
          wasFallback: true,
          promptVersion,
        };
      } catch (fallbackError) {
        await recordError(user.id);
        throw fallbackError;
      }
    }

    await recordError(user.id);
    throw error;
  }
};

interface AiGenerateResult {
  reply: string;
  model: string;
  wasFallback: boolean;
  promptVersion: string;
  tokenUsage: {
    input: number;
    output: number;
  };
}

export const runAiGenerate = async (
  options: AiServiceOptions,
): Promise<AiGenerateResult> => {
  const { messages, user, maxHistoryTurns = AI_RATE_LIMITS.max_history_turns, systemPromptOverride } =
    options;

  const lastUserMessage = messages.filter((m) => m.role === "user").pop();

  if (!lastUserMessage || typeof lastUserMessage.content !== "string") {
    throw new Error("No user message found");
  }

  const inputValidation = validateInput(lastUserMessage.content);
  if (!inputValidation.passed) {
    throw new Error(`GUARDRAIL:${inputValidation.reason}`);
  }

  const rateLimitInfo = await checkRateLimit(user.id);
  if (!rateLimitInfo.allowed) {
    throw new Error(
      "RATE_LIMIT:You have exceeded your rate limit. Please try again later.",
    );
  }

  acquireConcurrencySlot(user.id);

  const preparedMessages = prepareMessages(messages, maxHistoryTurns);
  const tools = createAiTools(user);
  const systemPrompt = systemPromptOverride ?? getSystemPrompt();
  const promptVersion = getPromptVersion();

  const config = getModelConfig(rateLimitInfo.degraded_mode);

  try {
    const result = await generateText({
      model: config.model,
      system: systemPrompt,
      messages: preparedMessages,
      tools,
      maxOutputTokens: config.maxOutputTokens,
      stopWhen: stepCountIs(10),
      temperature: config.temperature,
      ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
    });

    releaseConcurrencySlot(user.id);

    const { filtered } = filterOutput(result.text);

    const tokenUsage = {
      input: result.usage?.inputTokens ?? 0,
      output: result.usage?.outputTokens ?? 0,
    };

    await recordRequest(user.id, tokenUsage.input + tokenUsage.output);

    return {
      reply: filtered,
      model: config.modelName,
      wasFallback: rateLimitInfo.degraded_mode,
      promptVersion,
      tokenUsage,
    };
  } catch (error) {
    releaseConcurrencySlot(user.id);

    if (!rateLimitInfo.degraded_mode) {
      try {
        const fallbackConfig = getModelConfig(true);

        const result = await generateText({
          model: fallbackConfig.model,
          system: systemPrompt,
          messages: preparedMessages,
          tools,
          maxOutputTokens: fallbackConfig.maxOutputTokens,
          stopWhen: stepCountIs(10),
          temperature: fallbackConfig.temperature,
          ...(fallbackConfig.providerOptions ? { providerOptions: fallbackConfig.providerOptions } : {}),
        });

        releaseConcurrencySlot(user.id);

        const { filtered } = filterOutput(result.text);

        const tokenUsage = {
          input: result.usage?.inputTokens ?? 0,
          output: result.usage?.outputTokens ?? 0,
        };

        await recordRequest(user.id, tokenUsage.input + tokenUsage.output);

        return {
          reply: filtered,
          model: fallbackConfig.modelName,
          wasFallback: true,
          promptVersion,
          tokenUsage,
        };
      } catch (fallbackError) {
        await recordError(user.id);
        throw fallbackError;
      }
    }

    await recordError(user.id);
    throw error;
  }
};
