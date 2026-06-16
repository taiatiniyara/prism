import { db } from "@/db/connection";
import { aiUsageMetrics } from "@/db/schema/ai";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

const getTodayStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const PER_MINUTE_WINDOW_MS = 60_000;
const PER_MINUTE_MAX_REQUESTS = 20;
const PER_15MIN_MAX_REQUESTS = 100;

const requestTimestamps = new Map<string, number[]>();

const pruneTimestamps = (timestamps: number[], windowMs: number): number[] => {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff);
};

export const checkRateLimit = (userId: string): { allowed: boolean; retryAfterMs?: number } => {
  const now = Date.now();
  let stamps = requestTimestamps.get(userId) ?? [];

  stamps = pruneTimestamps(stamps, PER_MINUTE_WINDOW_MS);
  if (stamps.length >= PER_MINUTE_MAX_REQUESTS) {
    const oldestInWindow = stamps[0];
    const retryAfterMs = PER_MINUTE_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  const fifteenMinStamps = pruneTimestamps(stamps, 15 * PER_MINUTE_WINDOW_MS);
  if (fifteenMinStamps.length >= PER_15MIN_MAX_REQUESTS) {
    const oldestIn15 = fifteenMinStamps[0];
    const retryAfterMs = 15 * PER_MINUTE_WINDOW_MS - (now - oldestIn15);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  stamps.push(now);
  requestTimestamps.set(userId, stamps);

  if (requestTimestamps.size > 10000) {
    for (const [key, ts] of requestTimestamps) {
      if (ts.length === 0 || ts[ts.length - 1] < now - 30 * PER_MINUTE_WINDOW_MS) {
        requestTimestamps.delete(key);
      }
    }
  }

  return { allowed: true };
};

const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku-4-5-20251001": { inputPerM: 0.80, outputPerM: 4 },
  "claude-haiku-4-5": { inputPerM: 0.80, outputPerM: 4 },
};

interface RecordRequestParams {
  tokenCount: number;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
}

export const recordRequest = async (
  userId: string,
  params: RecordRequestParams,
): Promise<void> => {
  const todayStart = getTodayStart();
  const pricing = MODEL_PRICING[params.modelName] ?? { inputPerM: 3, outputPerM: 15 };
  const estimatedCostCents = Math.round(
    (params.inputTokens / 1_000_000) * pricing.inputPerM * 100 +
    (params.outputTokens / 1_000_000) * pricing.outputPerM * 100,
  );

  await db
    .insert(aiUsageMetrics)
    .values({
      user_id: userId,
      date: todayStart,
      request_count: 1,
      token_count: params.tokenCount,
      token_count_input: params.inputTokens,
      token_count_output: params.outputTokens,
      estimated_cost_cents: estimatedCostCents,
      tool_call_count: 0,
      error_count: 0,
    })
    .onConflictDoUpdate({
      target: [aiUsageMetrics.user_id, aiUsageMetrics.date],
      set: {
        request_count: sql`${aiUsageMetrics.request_count} + 1`,
        token_count: sql`${aiUsageMetrics.token_count} + ${params.tokenCount}`,
        token_count_input: sql`COALESCE(${aiUsageMetrics.token_count_input}, 0) + ${params.inputTokens}`,
        token_count_output: sql`COALESCE(${aiUsageMetrics.token_count_output}, 0) + ${params.outputTokens}`,
        estimated_cost_cents: sql`COALESCE(${aiUsageMetrics.estimated_cost_cents}, 0) + ${estimatedCostCents}`,
        updated_at: new Date(),
      },
    });
};

const upsertMetricIncrement = async (
  userId: string,
  field: "tool_call_count" | "error_count",
): Promise<void> => {
  const todayStart = getTodayStart();
  const column = aiUsageMetrics[field];

  await db
    .insert(aiUsageMetrics)
    .values({
      user_id: userId,
      date: todayStart,
      request_count: 0,
      token_count: 0,
      token_count_input: 0,
      token_count_output: 0,
      estimated_cost_cents: 0,
      tool_call_count: field === "tool_call_count" ? 1 : 0,
      error_count: field === "error_count" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [aiUsageMetrics.user_id, aiUsageMetrics.date],
      set: {
        [field]: sql`${column} + 1`,
        updated_at: new Date(),
      },
    });
};

export const recordToolCall = async (userId: string): Promise<void> => {
  await upsertMetricIncrement(userId, "tool_call_count");
};

export const recordError = async (userId: string): Promise<void> => {
  await upsertMetricIncrement(userId, "error_count");
};

const latencyBuckets = new Map<string, { samples: number[]; count: number }>();
const LATENCY_WINDOW_MS = 300_000;
const LATENCY_SAMPLE_SIZE = 100;

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
};

const computeLatencyStats = (samples: number[]): { p50: number; p95: number; p99: number } => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
};

export const recordLatency = (endpoint: string, latencyMs: number): void => {
  const key = `${endpoint}:${Math.floor(Date.now() / LATENCY_WINDOW_MS)}`;
  let bucket = latencyBuckets.get(key);
  if (!bucket) {
    bucket = { samples: [], count: 0 };
  }
  bucket.count++;
  bucket.samples.push(latencyMs);

  if (bucket.count % LATENCY_SAMPLE_SIZE === 0 || bucket.count === 1) {
    const stats = computeLatencyStats(bucket.samples);
    logger.info("[ai-latency]", {
      endpoint,
      p50: Math.round(stats.p50),
      p95: Math.round(stats.p95),
      p99: Math.round(stats.p99),
      count: bucket.count,
    });
    bucket.samples = [];
  }

  latencyBuckets.set(key, bucket);

  if (latencyBuckets.size > 100) {
    for (const [k] of latencyBuckets) {
      if (!k.endsWith(String(Math.floor(Date.now() / LATENCY_WINDOW_MS)))) {
        latencyBuckets.delete(k);
      }
    }
  }
};

export const getUsageStats = async (
  userId: string,
  days = 7,
): Promise<{
  totalRequests: number;
  totalTokens: number;
  totalCostCents: number;
  totalToolCalls: number;
  totalErrors: number;
  daily: Array<{ date: string; requests: number; tokens: number; costCents: number }>;
}> => {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(aiUsageMetrics)
    .where(sql`${aiUsageMetrics.user_id} = ${userId} AND ${aiUsageMetrics.date} >= ${since}`)
    .orderBy(sql`${aiUsageMetrics.date} DESC`)
    .limit(days + 1);

  let totalRequests = 0;
  let totalTokens = 0;
  let totalCostCents = 0;
  let totalToolCalls = 0;
  let totalErrors = 0;
  const daily: Array<{ date: string; requests: number; tokens: number; costCents: number }> = [];

  for (const row of rows) {
    totalRequests += row.request_count;
    totalTokens += row.token_count;
    totalCostCents += row.estimated_cost_cents ?? 0;
    totalToolCalls += row.tool_call_count;
    totalErrors += row.error_count;
    daily.push({
      date: row.date.toISOString().slice(0, 10),
      requests: row.request_count,
      tokens: row.token_count,
      costCents: row.estimated_cost_cents ?? 0,
    });
  }

  return { totalRequests, totalTokens, totalCostCents, totalToolCalls, totalErrors, daily };
};
