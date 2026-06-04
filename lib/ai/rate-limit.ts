import { db } from "@/db/connection";
import { aiUsageMetrics } from "@/db/schema/ai";
import { and, eq, gte } from "drizzle-orm";
import type { AiRateLimitInfo } from "./types";
import { AI_RATE_LIMITS } from "./types";

interface RateLimitState {
  request_count: number;
  token_count: number;
  window_start: Date;
}

const inMemoryStore = new Map<string, RateLimitState>();

const getTodayStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const getWindowStart = (): Date => {
  const now = new Date();
  return new Date(now.getTime() - 60 * 1000);
};

export const checkRateLimit = async (
  userId: string,
): Promise<AiRateLimitInfo> => {
  const todayStart = getTodayStart();
  const windowStart = getWindowStart();

  const key = `user:${userId}`;
  let state = inMemoryStore.get(key);

  if (!state || state.window_start < windowStart) {
    state = {
      request_count: 0,
      token_count: 0,
      window_start: windowStart,
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

  const resetAt = new Date(windowStart.getTime() + 60 * 1000);

  return {
    allowed: remainingRequests > 0 && remainingTokens > 0,
    remaining_requests: remainingRequests,
    remaining_tokens: remainingTokens,
    reset_at: resetAt,
    degraded_mode: degraded,
  };
};

export const recordRequest = async (
  userId: string,
  tokenCount: number,
): Promise<void> => {
  const key = `user:${userId}`;
  const state = inMemoryStore.get(key);

  if (state) {
    state.request_count++;
    state.token_count += tokenCount;
  }

  const todayStart = getTodayStart();

  const [existing] = await db
    .select()
    .from(aiUsageMetrics)
    .where(
      and(
        eq(aiUsageMetrics.user_id, userId),
        gte(aiUsageMetrics.date, todayStart),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(aiUsageMetrics)
      .set({
        request_count: existing.request_count + 1,
        token_count: existing.token_count + tokenCount,
        updated_at: new Date(),
      })
      .where(eq(aiUsageMetrics.id, existing.id));
  } else {
    await db.insert(aiUsageMetrics).values({
      user_id: userId,
      date: todayStart,
      request_count: 1,
      token_count: tokenCount,
      tool_call_count: 0,
      error_count: 0,
    });
  }
};

export const recordToolCall = async (userId: string): Promise<void> => {
  const todayStart = getTodayStart();

  const [existing] = await db
    .select()
    .from(aiUsageMetrics)
    .where(
      and(
        eq(aiUsageMetrics.user_id, userId),
        gte(aiUsageMetrics.date, todayStart),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(aiUsageMetrics)
      .set({
        tool_call_count: existing.tool_call_count + 1,
        updated_at: new Date(),
      })
      .where(eq(aiUsageMetrics.id, existing.id));
  }
};

export const recordError = async (userId: string): Promise<void> => {
  const todayStart = getTodayStart();

  const [existing] = await db
    .select()
    .from(aiUsageMetrics)
    .where(
      and(
        eq(aiUsageMetrics.user_id, userId),
        gte(aiUsageMetrics.date, todayStart),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(aiUsageMetrics)
      .set({
        error_count: existing.error_count + 1,
        updated_at: new Date(),
      })
      .where(eq(aiUsageMetrics.id, existing.id));
  }
};
