import { db } from "@/db/connection";
import { aiUsageMetrics } from "@/db/schema/ai";
import { sql } from "drizzle-orm";

const getTodayStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const recordRequest = async (
  userId: string,
  tokenCount: number,
): Promise<void> => {
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
