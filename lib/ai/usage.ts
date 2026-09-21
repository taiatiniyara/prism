// Token-usage + cost helpers. Dependency-free (no DB / SDK imports) so they are
// unit-testable in isolation.
//
// The AI SDK reports `inputTokens` as the TOTAL prompt size — uncached + cache-write +
// cache-read — with the split in `inputTokenDetails`. Anthropic bills those three at
// different rates (cache read ~0.1x, 5-minute cache write 1.25x), so pricing the total
// at the base input rate overstates spend several-fold on a cache-heavy tool loop.

export interface AiTokenUsage {
  inputTokens: number; // total: uncached + cacheRead + cacheWrite
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_TOKEN_USAGE: AiTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

interface SdkUsageLike {
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputTokenDetails?: {
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
  } | null;
}

export const toTokenUsage = (usage: SdkUsageLike | null | undefined): AiTokenUsage => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0,
  cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
  cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
});

export const addTokenUsage = (a: AiTokenUsage, b: AiTokenUsage): AiTokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

// USD per 1M tokens.
const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku-4-5-20251001": { inputPerM: 1, outputPerM: 5 },
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
};
const DEFAULT_PRICING = { inputPerM: 3, outputPerM: 15 };

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute TTL — the only TTL the service uses

export const estimateCostCents = (modelName: string, usage: AiTokenUsage): number => {
  const pricing = MODEL_PRICING[modelName] ?? DEFAULT_PRICING;
  // Clamp: a provider that reports no details yields 0/0 here, which degrades to the
  // old behaviour (everything at the base input rate) rather than going negative.
  const uncached = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  const inputUsd =
    ((uncached +
      usage.cacheReadTokens * CACHE_READ_MULTIPLIER +
      usage.cacheWriteTokens * CACHE_WRITE_MULTIPLIER) /
      1_000_000) *
    pricing.inputPerM;
  const outputUsd = (usage.outputTokens / 1_000_000) * pricing.outputPerM;
  return Math.round((inputUsd + outputUsd) * 100);
};
