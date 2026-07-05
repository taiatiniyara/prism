import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateText, stepCountIs } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { createAiTools } from "./tools";
import { getSystemPrompt, getPromptVersion } from "./prompt";
import { validateInput, filterOutput } from "./guardrails";
import { recordRequest, recordError } from "./rate-limit";
import { AI_MODELS, AI_DEFAULTS, type AiChatMessage } from "./types";
import { logger } from "@/lib/logging/logger";

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

const isTransientError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error);
  if (/429|rate.?limit|too many requests/i.test(msg)) return true;
  if (/502|503|504|bad gateway|service unavailable|gateway timeout/i.test(msg)) return true;
  if (/overloaded|server error|internal error/i.test(msg)) return true;
  if (error instanceof Error && error.name === "TimeoutError") return true;
  return false;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const RETRY_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<{ result: T; retries: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isTransientError(error)) {
        throw error;
      }
      const delay = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      logger.warn(`[ai-service] Retry ${attempt + 1}/${MAX_RETRIES} for ${label}`, {
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delay);
    }
  }
  throw lastError;
}

const modelCircuits = new Map<string, { failures: number; cooldownUntil: number }>();
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;

function checkCircuit(modelName: string): void {
  const circuit = getCircuitState(modelName);
  if (circuit.open) {
    throw new Error(`Circuit breaker open for ${modelName}. Try again in ${circuit.remaining}s.`);
  }
}

export function getCircuitState(modelName: string): { open: boolean; remaining: number } {
  const circuit = modelCircuits.get(modelName);
  if (circuit && Date.now() < circuit.cooldownUntil) {
    return { open: true, remaining: Math.ceil((circuit.cooldownUntil - Date.now()) / 1000) };
  }
  return { open: false, remaining: 0 };
}

function recordCircuitSuccess(modelName: string): void {
  modelCircuits.delete(modelName);
}

function recordCircuitFailure(modelName: string): void {
  const circuit = modelCircuits.get(modelName) ?? { failures: 0, cooldownUntil: 0 };
  circuit.failures++;
  if (circuit.failures >= CIRCUIT_THRESHOLD) {
    circuit.cooldownUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    logger.error("[ai-service] Circuit breaker opened", { model: modelName, cooldownMs: CIRCUIT_COOLDOWN_MS });
  }
  modelCircuits.set(modelName, circuit);
}

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

  const tools = createAiTools(user, options.abortSignal, options.sessionId);
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
  let retries = 0;

  try {
    checkCircuit(primaryConfig.modelName);

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = streamWithConfig(req, primaryConfig, false, callbacks, options.abortSignal);
        if (attempt > 0) retries = attempt;
        recordCircuitSuccess(primaryConfig.modelName);
        return {
          stream: result.textStream,
          fullStream: result.fullStream,
          model: primaryConfig.modelName,
          wasFallback: false,
          promptVersion: req.promptVersion,
        };
      } catch (error) {
        lastError = error;
        if (attempt === MAX_RETRIES || !isTransientError(error)) throw error;
        const delay = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        logger.warn(`[ai-service] Retry ${attempt + 1}/${MAX_RETRIES} for stream:${primaryConfig.modelName}`, { delayMs: delay });
        await sleep(delay);
      }
    }
    throw lastError;
  } catch (primaryError) {
    recordCircuitFailure(primaryConfig.modelName);
    logger.warn("[ai-service] Primary model failed, trying fallback", {
      primaryModel: primaryConfig.modelName,
      retries,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      const fallbackConfig = getModelConfig(true);
      checkCircuit(fallbackConfig.modelName);

      let fallbackLastError: unknown;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = streamWithConfig(req, fallbackConfig, true, callbacks);
          recordCircuitSuccess(fallbackConfig.modelName);
          return {
            stream: result.textStream,
            fullStream: result.fullStream,
            model: fallbackConfig.modelName,
            wasFallback: true,
            promptVersion: req.promptVersion,
          };
        } catch (error) {
          fallbackLastError = error;
          if (attempt === MAX_RETRIES || !isTransientError(error)) throw error;
          const delay = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          logger.warn(`[ai-service] Retry ${attempt + 1}/${MAX_RETRIES} for stream:${fallbackConfig.modelName}`, { delayMs: delay });
          await sleep(delay);
        }
      }
      throw fallbackLastError;
    } catch (fallbackError) {
      recordCircuitFailure(getModelConfig(true).modelName);
      await recordError(options.user.id);
      logger.error("[ai-service] Both primary and fallback models failed", {
        primaryModel: primaryConfig.modelName,
        fallbackModel: getModelConfig(true).modelName,
        retries,
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
  let retries = 0;

  try {
    checkCircuit(primaryConfig.modelName);
    const { result, retries: r } = await withRetry(
      () => generateWithConfig(req, primaryConfig, options.abortSignal),
      `generate:${primaryConfig.modelName}`,
    );
    retries = r;
    recordCircuitSuccess(primaryConfig.modelName);

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
    recordCircuitFailure(primaryConfig.modelName);
    logger.warn("[ai-service] Primary generate model failed, trying fallback", {
      primaryModel: primaryConfig.modelName,
      retries,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      const fallbackConfig = getModelConfig(true);
      checkCircuit(fallbackConfig.modelName);
      const { result } = await withRetry(
        () => generateWithConfig(req, fallbackConfig),
        `generate:${fallbackConfig.modelName}`,
      );
      recordCircuitSuccess(fallbackConfig.modelName);

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
      recordCircuitFailure(getModelConfig(true).modelName);
      await recordError(options.user.id);
      logger.error("[ai-service] Both primary and fallback generate models failed", {
        retries,
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw fallbackError;
    }
  }
};
