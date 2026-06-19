import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateText, stepCountIs } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { createAiTools } from "./tools";
import { getSystemPrompt, getPromptVersion } from "./prompt";
import { validateInput, filterOutput } from "./guardrails";
import { recordRequest, recordError } from "./rate-limit";
import { AI_MODELS, AI_DEFAULTS, type AiChatMessage } from "./types";
import { logger } from "@/lib/logger";

interface AiServiceOptions {
  messages: AiChatMessage[];
  user: CurrentUser;
  sessionId?: number;
  maxHistoryTurns?: number;
  systemPromptOverride?: string;
  abortSignal?: AbortSignal;
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

type SdkMessage = { role: "user" | "assistant" | "system"; content: string };

const APPROX_CHARS_PER_TOKEN = 3;
const MAX_INPUT_TOKENS = 18000;
const TOOL_DEFINITIONS_TOKENS_RESERVE = 4000;

const getModelContextLimit = (modelName: string): number => {
  if (/sonnet/i.test(modelName)) return 200000;
  if (/haiku/i.test(modelName)) return 200000;
  return 200000;
};

const estimateTokens = (text: string): number =>
  Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);

const getRoleBasedMaxTurns = (role: string | null | undefined): number => {
  const upper = (role ?? "").toUpperCase();
  if (upper === "BMO" || upper === "DEV") return 8;
  if (upper === "CEO") return 6;
  if (upper === "EXT") return 3;
  return AI_DEFAULTS.max_history_turns;
};

const prepareMessages = (
  messages: AiChatMessage[],
  maxHistoryTurns: number,
): SdkMessage[] => {
  const maxMessages = maxHistoryTurns * 2;
  const recentMessages = messages.slice(-maxMessages);

  let totalTokens = 0;
  const trimmed: SdkMessage[] = [];
  for (const msg of recentMessages) {
    const content = typeof msg.content === "string" ? msg.content : "";
    const cleaned = content.trim();
    if (!cleaned) continue;
    const msgTokens = estimateTokens(cleaned);
    totalTokens += msgTokens;
    trimmed.push({ role: msg.role, content: cleaned });
    if (totalTokens > MAX_INPUT_TOKENS) break;
  }

  return trimmed;
};

const isThinkingModel = (modelName: string): boolean =>
  /^claude-sonnet-4/i.test(modelName);

const getModelConfig = (fallback: boolean) => {
  const modelName = fallback ? AI_MODELS.fallback : AI_MODELS.primary;
  const thinking = isThinkingModel(modelName);

  const baseConfig = {
    model: anthropic(modelName),
    modelName,
    maxOutputTokens: thinking ? 8000 : 2500,
    ...(thinking ? {} : { temperature: fallback ? 0.3 : 0.4 }),
  };

  return {
    ...baseConfig,
    providerOptions: thinking
      ? { anthropic: { thinking: { type: "adaptive" as const, display: "summarized" as const }, effort: "medium" as const } }
      : undefined,
  };
};

interface PreparedRequest {
  sdkMessages: SdkMessage[];
  tools: ReturnType<typeof createAiTools>;
  systemPrompt: string;
  promptVersion: string;
  config: ReturnType<typeof getModelConfig>;
  availableOutput: number;
}

interface ModelCallbacks {
  onRecording: (params: {
    tokenCount: number;
    inputTokens: number;
    outputTokens: number;
    modelName: string;
  }) => Promise<void>;
  onCompletion?: (info: {
    text: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls: Array<{ toolName: string; input: unknown }>;
    model: string;
    wasFallback: boolean;
    promptVersion: string;
  }) => Promise<void>;
}

const prepareRequest = (options: AiServiceOptions): PreparedRequest => {
  const { messages, user, maxHistoryTurns, systemPromptOverride } = options;

  const effectiveMaxTurns = maxHistoryTurns ?? getRoleBasedMaxTurns(user.role);

  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  if (!lastUserMessage || typeof lastUserMessage.content !== "string") {
    throw new Error("No user message found");
  }

  const inputValidation = validateInput(lastUserMessage.content);
  if (!inputValidation.passed) {
    throw new Error(`GUARDRAIL:${inputValidation.reason}`);
  }

  const sdkMessages = prepareMessages(messages, effectiveMaxTurns);

  const tools = createAiTools(user, options.abortSignal);
  const systemPrompt = systemPromptOverride ?? getSystemPrompt();
  const promptVersion = getPromptVersion();
  const config = getModelConfig(false);

  const contextLimit = getModelContextLimit(config.modelName);
  const systemPromptTokens = estimateTokens(systemPrompt);
  const messageTokens = sdkMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const estimatedTotalInput = systemPromptTokens + messageTokens + TOOL_DEFINITIONS_TOKENS_RESERVE;
  const availableOutput = contextLimit - estimatedTotalInput;

  if (availableOutput < config.maxOutputTokens) {
    logger.warn("[ai-service] Context window may overflow", {
      model: config.modelName,
      contextLimit,
      systemPromptTokens,
      messageTokens,
      estimatedTotalInput,
      maxOutputTokens: config.maxOutputTokens,
      availableOutput,
    });
  }

  if (availableOutput < 500) {
    throw new Error("Conversation is too long. Please start a new chat to continue.");
  }

  return { sdkMessages, tools, systemPrompt, promptVersion, config, availableOutput };
};

const createCallbacks = (
  user: CurrentUser,
  onFinish: AiServiceOptions["onFinish"],
): ModelCallbacks => {
  const onRecording = async (params: {
    tokenCount: number;
    inputTokens: number;
    outputTokens: number;
    modelName: string;
  }) => {
    try {
      await recordRequest(user.id, params);
    } catch {
      // best-effort
    }
  };

  const onCompletion = onFinish
    ? async (info: {
        text: string;
        usage: { inputTokens: number; outputTokens: number };
        toolCalls: Array<{ toolName: string; input: unknown }>;
        model: string;
        wasFallback: boolean;
        promptVersion: string;
      }) => {
        try {
          await onFinish(info);
        } catch (err) {
          logger.error("[ai-service] onFinish callback failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    : undefined;

  return { onRecording, onCompletion };
};

const buildOnFinishHandler = (
  callbacks: ModelCallbacks,
  modelName: string,
  isFallback: boolean,
  promptVersion: string,
) => {
  return async (finish: {
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    toolCalls: Array<{ toolName: string; input: unknown }>;
  }) => {
    await callbacks.onRecording({
      tokenCount: (finish.usage?.inputTokens ?? 0) + (finish.usage?.outputTokens ?? 0),
      inputTokens: finish.usage?.inputTokens ?? 0,
      outputTokens: finish.usage?.outputTokens ?? 0,
      modelName,
    });

    if (callbacks.onCompletion) {
      await callbacks.onCompletion({
        text: finish.text,
        usage: {
          inputTokens: finish.usage?.inputTokens ?? 0,
          outputTokens: finish.usage?.outputTokens ?? 0,
        },
        toolCalls: finish.toolCalls.map((tc) => ({ toolName: tc.toolName, input: tc.input })),
        model: modelName,
        wasFallback: isFallback,
        promptVersion,
      });
    }
  };
};

const streamWithConfig = (
  req: PreparedRequest,
  config: ReturnType<typeof getModelConfig>,
  isFallback: boolean,
  callbacks: ModelCallbacks,
  abortSignal?: AbortSignal,
) => {
  return streamText({
    model: config.model,
    system: req.systemPrompt,
    messages: req.sdkMessages,
    tools: req.tools,
    maxOutputTokens: config.maxOutputTokens,
    stopWhen: stepCountIs(10),
    ...(config.temperature != null ? { temperature: config.temperature } : {}),
    ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
    ...(abortSignal ? { abortSignal } : {}),
    onFinish: buildOnFinishHandler(callbacks, config.modelName, isFallback, req.promptVersion),
  });
};

const generateWithConfig = (
  req: PreparedRequest,
  config: ReturnType<typeof getModelConfig>,
  abortSignal?: AbortSignal,
) => {
  return generateText({
    model: config.model,
    system: req.systemPrompt,
    messages: req.sdkMessages,
    tools: req.tools,
    maxOutputTokens: config.maxOutputTokens,
    stopWhen: stepCountIs(10),
    ...(config.temperature != null ? { temperature: config.temperature } : {}),
    ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
    ...(abortSignal ? { abortSignal } : {}),
  });
};

export const runAiStream = async (
  options: AiServiceOptions,
): Promise<AiStreamResult> => {
  const req = prepareRequest(options);
  const callbacks = createCallbacks(options.user, options.onFinish);

  const primaryConfig = req.config;

  try {
    const result = await streamWithConfig(req, primaryConfig, false, callbacks, options.abortSignal);
    return {
      stream: result.textStream,
      fullStream: result.fullStream,
      model: primaryConfig.modelName,
      wasFallback: false,
      promptVersion: req.promptVersion,
    };
  } catch (primaryError) {
    logger.warn("[ai-service] Primary model failed, trying fallback", {
      primaryModel: primaryConfig.modelName,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      const fallbackConfig = getModelConfig(true);
      const result = await streamWithConfig(req, fallbackConfig, true, callbacks);
      return {
        stream: result.textStream,
        fullStream: result.fullStream,
        model: fallbackConfig.modelName,
        wasFallback: true,
        promptVersion: req.promptVersion,
      };
    } catch (fallbackError) {
      await recordError(options.user.id);
      logger.error("[ai-service] Both primary and fallback models failed", {
        primaryModel: primaryConfig.modelName,
        fallbackModel: getModelConfig(true).modelName,
        primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError),
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw fallbackError;
    }
  }
};

export const runAiGenerate = async (
  options: AiServiceOptions,
): Promise<AiGenerateResult> => {
  const req = prepareRequest(options);

  const primaryConfig = req.config;

  try {
    const result = await generateWithConfig(req, primaryConfig, options.abortSignal);

    const { filtered } = filterOutput(result.text);

    const tokenUsage = {
      input: result.usage?.inputTokens ?? 0,
      output: result.usage?.outputTokens ?? 0,
    };

    await recordRequest(options.user.id, {
      tokenCount: tokenUsage.input + tokenUsage.output,
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
      modelName: primaryConfig.modelName,
    });

    return {
      reply: filtered,
      model: primaryConfig.modelName,
      wasFallback: false,
      promptVersion: req.promptVersion,
      tokenUsage,
    };
  } catch (primaryError) {
    logger.warn("[ai-service] Primary generate model failed, trying fallback", {
      primaryModel: primaryConfig.modelName,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      const fallbackConfig = getModelConfig(true);

      const result = await generateWithConfig(req, fallbackConfig);

      const { filtered } = filterOutput(result.text);

      const tokenUsage = {
        input: result.usage?.inputTokens ?? 0,
        output: result.usage?.outputTokens ?? 0,
      };

      await recordRequest(options.user.id, {
        tokenCount: tokenUsage.input + tokenUsage.output,
        inputTokens: tokenUsage.input,
        outputTokens: tokenUsage.output,
        modelName: fallbackConfig.modelName,
      });

      return {
        reply: filtered,
        model: fallbackConfig.modelName,
        wasFallback: true,
        promptVersion: req.promptVersion,
        tokenUsage,
      };
    } catch (fallbackError) {
      await recordError(options.user.id);
      logger.error("[ai-service] Both primary and fallback generate models failed", {
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw fallbackError;
    }
  }
};
