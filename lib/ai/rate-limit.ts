import { db } from "@/db/connection";
import { aiUsageMetrics } from "@/db/schema/ai";
import { and, eq, gte, sql } from "drizzle-orm";
import type { AiRateLimitInfo } from "./types";
import { AI_RATE_LIMITS } from "./types";

interface RateLimitState {
  request_count: number;
  token_count: number;
  window_start: Date;
}

const inMemoryStore = new Map<string, RateLimitState>();

// In-memory concurrency tracker — per-user active request count.
// For multi-instance deployments, replace with Redis/DB atomic counter.
const MAX_CONCURRENT_REQUESTS = 5;
const activeRequests = new Map<string, number>();

const WINDOW_MS = 60 * 1000;

const getTodayStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const checkRateLimit = async (
  userId: string,
): Promise<AiRateLimitInfo> => {
  const concurrent = activeRequests.get(userId) ?? 0;

  const todayStart = getTodayStart();
  const now = Date.now();
  const threshold = now - WINDOW_MS;

  const key = `user:${userId}`;
  let state = inMemoryStore.get(key);

  if (!state || state.window_start.getTime() <= threshold) {
    state = {
      request_count: 0,
      token_count: 0,
      window_start: new Date(now),
    };
    inMemoryStore.set(key, state);
  }

  const [metrics] = await db
    .select()
    .from(aiUsageMetrics)
    .where(
      and(
        eq(aiUsageMetrics.user_id, userId),
        gte(aiUsageMetrics.date, todayStart),
      ),
    )
    .limit(1);

  const dailyTokens = metrics?.token_count ?? 0;
  const degraded = dailyTokens >= AI_RATE_LIMITS.tokens_per_day * 0.9;

  const remainingRequests = Math.max(
    0,
    AI_RATE_LIMITS.requests_per_minute - state.request_count,
  );

  const remainingTokens = Math.max(
    0,
    AI_RATE_LIMITS.tokens_per_day - dailyTokens,
  );

  const resetAt = new Date(state.window_start.getTime() + WINDOW_MS);

  return {
    allowed: remainingRequests > 0 && remainingTokens > 0 && concurrent < MAX_CONCURRENT_REQUESTS,
    remaining_requests: remainingRequests,
    remaining_tokens: remainingTokens,
    reset_at: resetAt,
    degraded_mode: degraded,
    concurrent_count: concurrent,
  };
};

export const acquireConcurrencySlot = (userId: string): void => {
  const current = activeRequests.get(userId) ?? 0;
  activeRequests.set(userId, current + 1);
};

export const releaseConcurrencySlot = (userId: string): void => {
  const current = activeRequests.get(userId) ?? 0;
  if (current <= 1) {
    activeRequests.delete(userId);
  } else {
    activeRequests.set(userId, current - 1);
  }
};

export const syncInMemoryFromDb = async (userId: string): Promise<void> => {
  const todayStart = getTodayStart();
  const key = `user:${userId}`;
  const existing = inMemoryStore.get(key);

  if (!existing || existing.token_count === 0) {
    const [metrics] = await db
      .select()
      .from(aiUsageMetrics)
      .where(
        and(
          eq(aiUsageMetrics.user_id, userId),
          gte(aiUsageMetrics.date, todayStart),
        ),
      )
      .limit(1);

    if (metrics) {
      inMemoryStore.set(key, {
        request_count: metrics.request_count,
        token_count: existing?.token_count ?? metrics.token_count,
        window_start: existing?.window_start ?? new Date(),
      });
    }
  }
};

export const recordRequest = async (
  userId: string,
  tokenCount: number,
): Promise<void> => {
  const key = `user:${userId}`;
  const state = inMemoryStore.get(key);
  const now = Date.now();

  if (state) {
    if (state.window_start.getTime() <= now - WINDOW_MS) {
      state.request_count = 1;
      state.token_count = tokenCount;
      state.window_start = new Date(now);
    } else {
      state.request_count++;
      state.token_count += tokenCount;
    }
  }

  const todayStart = getTodayStart();

  await db
    .insert(aiUsageMetrics)
    .values({
      user_id: userId,
      date: todayStart,
      request_count: 1,
      token_count: tokenCount,
      tool_call_count: 0,
      error_count: 0,
    })
    .onConflictDoUpdate({
      target: [aiUsageMetrics.user_id, aiUsageMetrics.date],
      set: {
        request_count: sql`${aiUsageMetrics.request_count} + 1`,
        token_count: sql`${aiUsageMetrics.token_count} + ${tokenCount}`,
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
