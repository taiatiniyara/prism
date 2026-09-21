import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateText, stepCountIs, type SystemModelMessage } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { createAiTools } from "./tools";
import { buildSystemPrompt, getPromptVersion } from "./prompt";
import { getAiSourceConfig } from "./source-setting";
import { validateInput, filterOutput } from "./guardrails";
import { recordRequest, recordError } from "./rate-limit";
import { AI_MODELS, AI_DEFAULTS, type AiChatMessage } from "./types";
import { prepareMessages as trimHistory, estimateTokens, type SdkMessage } from "./history";
import { toTokenUsage, estimateCostCents, type AiTokenUsage } from "./usage";
import { logger } from "@/lib/logging/logger";

interface AiServiceOptions {
  messages: AiChatMessage[];
  user: CurrentUser;
  sessionId?: number;
  maxHistoryTurns?: number;
  systemPromptOverride?: string;
  // Per-request context (audience register, conversation summary, notices). Sent as a
  // second, UNCACHED system block after the cache breakpoint, so it never invalidates
  // the shared tools+system cache entry the way concatenating it into the base did.
  systemPromptSuffix?: string;
  abortSignal?: AbortSignal;
  onFinish?: (info: {
    text: string;
    usage: AiTokenUsage;
    toolCalls: Array<{ toolName: string; input: unknown }>;
    model: string;
    wasFallback: boolean;
    promptVersion: string;
  }) => Promise<void>;
}

interface AiStreamResult {
  stream: ReturnType<typeof streamText>["textStream"];
  fullStream: AsyncIterable<
    ReturnType<typeof streamText>["fullStream"] extends AsyncIterable<infer P> ? P : never
  >;
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
    cacheRead: number;
    cacheWrite: number;
  };
  steps: Array<{
    toolCalls: Array<{ toolName: string }>;
    toolResults: Array<{ toolName: string; ok: boolean }>;
  }>;
}

const EMPTY_ANSWER_NUDGE =
  "IMPORTANT: You have already gathered the data needed to answer. You MUST now write your complete final answer to the user in full, directly addressing their question. Do not make any further tool calls, and do not end your turn with an empty response. Write the answer now.";

// Measured 2026-09-22: the ~70 tool definitions are ~17.6k tokens (system prompt ~7.6k).
const TOOL_DEFINITIONS_TOKENS_RESERVE = 18000;

const getModelContextLimit = (modelName: string): number => {
  if (/sonnet/i.test(modelName)) return 200000;
  if (/haiku/i.test(modelName)) return 200000;
  return 200000;
};

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

// The system prompt (~9k tokens) and tool definitions (~70 tools) are identical on
// every step of a multi-step turn, and often identical turn-to-turn within a session.
// Anthropic prompt caching skips re-processing that prefix on a cache hit, which is
// most of what makes time-to-first-token slow on tool-using questions.
const ANTHROPIC_CACHE_CONTROL = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};

const withCachedLastTool = <T extends Record<string, unknown>>(tools: T): T => {
  const keys = Object.keys(tools);
  const lastKey = keys[keys.length - 1];
  if (!lastKey) return tools;
  return {
    ...tools,
    [lastKey]: { ...(tools[lastKey] as object), providerOptions: ANTHROPIC_CACHE_CONTROL },
  } as T;
};

const recordUsage = (userId: string, usage: AiTokenUsage, modelName: string): Promise<void> =>
  recordRequest(userId, {
    tokenCount: usage.inputTokens + usage.outputTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostCents: estimateCostCents(modelName, usage),
  });

const toGenerateTokenUsage = (usage: AiTokenUsage): AiGenerateResult["tokenUsage"] => ({
  input: usage.inputTokens,
  output: usage.outputTokens,
  cacheRead: usage.cacheReadTokens,
  cacheWrite: usage.cacheWriteTokens,
});

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

const prepareMessages = (messages: AiChatMessage[], maxHistoryTurns: number): SdkMessage[] =>
  trimHistory(messages, maxHistoryTurns, (role) =>
    logger.warn("[ai-service] Dropping message with invalid role", { role }),
  );

const getModelConfig = (fallback: boolean) => {
  const modelName = fallback ? AI_MODELS.fallback : AI_MODELS.primary;

  // Extended thinking is DISABLED. With multi-step tool use it produced empty final
  // answers on data questions: after a tool call, the post-tool step yielded no text
  // (Anthropic reasoning needs thinking-block continuity across tool steps, which the
  // SDK/adaptive-thinking config wasn't preserving). Meta questions answered in one
  // step, so only tool-using data questions broke — matching the logs, and the pre-
  // thinking behaviour that answered data questions fine. A normal tool-using
  // generation is reliable. Re-enable thinking only once thinking+tools is verified.
  return {
    model: anthropic(modelName),
    modelName,
    maxOutputTokens: 6000, // ample for a full data answer without a reasoning budget
    temperature: fallback ? 0.3 : 0.4,
    providerOptions: undefined,
  };
};

interface PreparedRequest {
  sdkMessages: SdkMessage[];
  tools: ReturnType<typeof createAiTools>;
  systemPrompt: string;
  systemPromptSuffix: string;
  promptVersion: string;
  config: ReturnType<typeof getModelConfig>;
  availableOutput: number;
}

interface ModelCallbacks {
  onRecording: (usage: AiTokenUsage, modelName: string) => Promise<void>;
  onCompletion?: (info: {
    text: string;
    usage: AiTokenUsage;
    toolCalls: Array<{ toolName: string; input: unknown }>;
    model: string;
    wasFallback: boolean;
    promptVersion: string;
  }) => Promise<void>;
}

const prepareRequest = async (
  options: AiServiceOptions,
): Promise<PreparedRequest> => {
  const { messages, user, maxHistoryTurns, systemPromptOverride } = options;
  const systemPromptSuffix = (options.systemPromptSuffix ?? "").trim();

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

  // Resolve the DEV-configured primary source ONCE so the tool descriptions and the
  // system prompt agree on which source is primary.
  const { primary, secondary } = await getAiSourceConfig();
  const tools = withCachedLastTool(
    createAiTools(user, options.abortSignal, options.sessionId, primary, secondary),
  );
  const systemPrompt =
    systemPromptOverride ?? buildSystemPrompt(primary, secondary);
  const promptVersion = getPromptVersion();
  const config = getModelConfig(false);

  const contextLimit = getModelContextLimit(config.modelName);
  const systemPromptTokens = estimateTokens(systemPrompt) + estimateTokens(systemPromptSuffix);
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

  return { sdkMessages, tools, systemPrompt, systemPromptSuffix, promptVersion, config, availableOutput };
};

const createCallbacks = (
  user: CurrentUser,
  onFinish: AiServiceOptions["onFinish"],
): ModelCallbacks => {
  const onRecording = async (usage: AiTokenUsage, modelName: string) => {
    try {
      await recordUsage(user.id, usage, modelName);
    } catch {
      // best-effort
    }
  };

  const onCompletion = onFinish
    ? async (info: {
        text: string;
        usage: AiTokenUsage;
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
    usage?: Parameters<typeof toTokenUsage>[0];
    toolCalls: Array<{ toolName: string; input: unknown }>;
  }) => {
    // ai@7: `usage` on the finish event is already aggregated across every step.
    const usage = toTokenUsage(finish.usage);
    await callbacks.onRecording(usage, modelName);

    if (callbacks.onCompletion) {
      await callbacks.onCompletion({
        text: finish.text,
        usage,
        toolCalls: finish.toolCalls.map((tc) => ({ toolName: tc.toolName, input: tc.input })),
        model: modelName,
        wasFallback: isFallback,
        promptVersion,
      });
    }
  };
};

// streamText() resolves synchronously without waiting on the model call, so a
// try/catch around the call itself never sees provider errors (429/503/overloaded) —
// those only surface later as an "error" part inside fullStream. Peek the first part
// before handing the stream to the caller: an immediate error is thrown here (so the
// retry/fallback loop below can act on it, since nothing has reached the client yet);
// anything else is replayed followed by the rest of the stream, unchanged.
const withFirstChunkCheck = async <T extends { type: string; error?: unknown }>(
  fullStream: AsyncIterable<T>,
): Promise<AsyncIterable<T>> => {
  const iterator = fullStream[Symbol.asyncIterator]();
  const first = await iterator.next();

  if (!first.done && first.value.type === "error") {
    const err = first.value.error;
    throw err instanceof Error ? err : new Error(String(err));
  }

  return {
    [Symbol.asyncIterator]() {
      let firstYielded = first.done ?? false;
      return {
        next: (): Promise<IteratorResult<T>> => {
          if (!firstYielded) {
            firstYielded = true;
            return Promise.resolve(first as IteratorResult<T>);
          }
          return iterator.next();
        },
      };
    },
  };
};

// Block 1 = the static base prompt, carrying the cache breakpoint (tools render before
// system, so this one marker caches tools + base together, shared across every user).
// Block 2 = per-request context, deliberately AFTER the breakpoint and unmarked.
const buildInstructions = (req: PreparedRequest): SystemModelMessage[] => [
  { role: "system", content: req.systemPrompt, providerOptions: ANTHROPIC_CACHE_CONTROL },
  ...(req.systemPromptSuffix
    ? [{ role: "system" as const, content: req.systemPromptSuffix }]
    : []),
];

const streamWithConfig = (
  req: PreparedRequest,
  config: ReturnType<typeof getModelConfig>,
  isFallback: boolean,
  callbacks: ModelCallbacks,
  abortSignal?: AbortSignal,
) => {
  return streamText({
    model: config.model,
    instructions: buildInstructions(req),
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
    instructions: buildInstructions(req),
    messages: req.sdkMessages,
    tools: req.tools,
    maxOutputTokens: config.maxOutputTokens,
    stopWhen: stepCountIs(10),
    ...(config.temperature != null ? { temperature: config.temperature } : {}),
    ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
    ...(abortSignal ? { abortSignal } : {}),
  });
};

// Runs generateText with transient-error retries, and additionally retries once with a
// synthesis nudge when the model finished after tool use but produced an empty final step
// (a v7/Anthropic intermittent failure that otherwise yields blank answers to the user).
const generateWithRetry = async (
  req: PreparedRequest,
  config: ReturnType<typeof getModelConfig>,
  abortSignal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof generateWithConfig>>> => {
  const first = await withRetry(
    () => generateWithConfig(req, config, abortSignal),
    `generate:${config.modelName}`,
  );
  let result = first.result;

  const usedTools = result.steps.some((s) => (s.toolCalls ?? []).length > 0);
  if (usedTools && !(result.text ?? "").trim()) {
    logger.warn(`[ai-service] Empty final answer after tool use (${config.modelName}); retrying with synthesis nudge`);
    const nudgedReq: PreparedRequest = {
      ...req,
      // In the uncached suffix so the retry still reads the tools+system cache entry.
      systemPromptSuffix: [req.systemPromptSuffix, EMPTY_ANSWER_NUDGE].filter(Boolean).join("\n\n"),
    };
    const retried = await withRetry(
      () => generateWithConfig(nudgedReq, config, abortSignal),
      `generate-empty-retry:${config.modelName}`,
    );
    result = retried.result;
  }

  return result;
};

type GenerateStepLike = {
  toolCalls: Array<{ toolName: string }>;
  toolResults: Array<{ toolName: string }>;
};

const stepToProgress = (step: GenerateStepLike): AiGenerateResult["steps"][number] => ({
  toolCalls: (step.toolCalls ?? []).map((tc) => ({ toolName: tc.toolName })),
  toolResults: (step.toolResults ?? []).map((tr) => ({ toolName: tr.toolName, ok: true })),
});

export const runAiStream = async (
  options: AiServiceOptions,
): Promise<AiStreamResult> => {
  const req = await prepareRequest(options);
  const callbacks = createCallbacks(options.user, options.onFinish);

  const primaryConfig = req.config;
  let retries = 0;

  try {
    checkCircuit(primaryConfig.modelName);

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = streamWithConfig(req, primaryConfig, false, callbacks, options.abortSignal);
        const fullStream = await withFirstChunkCheck(result.fullStream);
        if (attempt > 0) retries = attempt;
        recordCircuitSuccess(primaryConfig.modelName);
        return {
          stream: result.textStream,
          fullStream,
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
          const fullStream = await withFirstChunkCheck(result.fullStream);
          recordCircuitSuccess(fallbackConfig.modelName);
          return {
            stream: result.textStream,
            fullStream,
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
  const req = await prepareRequest(options);

  const primaryConfig = req.config;

  try {
    checkCircuit(primaryConfig.modelName);
    const result = await generateWithRetry(req, primaryConfig, options.abortSignal);
    recordCircuitSuccess(primaryConfig.modelName);

    const { filtered } = filterOutput(result.text);

    const usage = toTokenUsage(result.usage);
    const tokenUsage = toGenerateTokenUsage(usage);
    await recordUsage(options.user.id, usage, primaryConfig.modelName);

    return {
      reply: filtered,
      model: primaryConfig.modelName,
      wasFallback: false,
      promptVersion: req.promptVersion,
      tokenUsage,
      steps: result.steps.map(stepToProgress),
    };
  } catch (primaryError) {
    recordCircuitFailure(primaryConfig.modelName);
    logger.warn("[ai-service] Primary generate model failed, trying fallback", {
      primaryModel: primaryConfig.modelName,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      const fallbackConfig = getModelConfig(true);
      checkCircuit(fallbackConfig.modelName);
      const result = await generateWithRetry(req, fallbackConfig);
      recordCircuitSuccess(fallbackConfig.modelName);

      const { filtered } = filterOutput(result.text);

      const usage = toTokenUsage(result.usage);
      const tokenUsage = toGenerateTokenUsage(usage);
      await recordUsage(options.user.id, usage, fallbackConfig.modelName);

      return {
        reply: filtered,
        model: fallbackConfig.modelName,
        wasFallback: true,
        promptVersion: req.promptVersion,
        tokenUsage,
        steps: result.steps.map(stepToProgress),
      };
    } catch (fallbackError) {
      recordCircuitFailure(getModelConfig(true).modelName);
      await recordError(options.user.id);
      logger.error("[ai-service] Both primary and fallback generate models failed", {
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw fallbackError;
    }
  }
};

// Single-shot housekeeping call (e.g. conversation summaries) on the mini model with NO
// tools and NO PRISM system prompt. runAiGenerate would send the full ~25k-token
// tools+system prefix to the primary model for a task that needs neither.
export const runAiMiniGenerate = async (options: {
  userId: string;
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
}): Promise<string> => {
  const modelName = AI_MODELS.mini;
  const { result } = await withRetry(
    () =>
      generateText({
        model: anthropic(modelName),
        ...(options.system ? { instructions: options.system } : {}),
        prompt: options.prompt,
        maxOutputTokens: options.maxOutputTokens ?? 800,
        temperature: 0,
      }),
    `mini-generate:${modelName}`,
  );

  try {
    await recordUsage(options.userId, toTokenUsage(result.usage), modelName);
  } catch {
    // best-effort
  }

  return result.text;
};
