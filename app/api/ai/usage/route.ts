import { db } from "@/db/connection";
import { getCurrentUser } from "@/lib/user.service";
import { sql } from "drizzle-orm";

export async function GET(request: Request): Promise<Response> {
  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "DEV" && currentUser.role !== "BMO") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30));
  const type = searchParams.get("type") ?? "overview";

  try {
    if (type === "per-user") {
      const result = await db.execute(sql`
        SELECT
          m.user_id AS "userId",
          u.name AS "userName",
          u.email AS "userEmail",
          sum(m.request_count)::int AS "requests",
          sum(m.token_count_input)::int AS "tokensIn",
          sum(m.token_count_output)::int AS "tokensOut",
          sum(m.estimated_cost_cents)::int AS "costCents",
          sum(m.tool_call_count)::int AS "toolCalls",
          sum(m.error_count)::int AS "errors"
        FROM "ai_usage_metrics" m
        INNER JOIN "user" u ON m.user_id = u.id
        WHERE m.date >= now() - make_interval(days => ${days})
        GROUP BY m.user_id, u.name, u.email
        ORDER BY sum(m.estimated_cost_cents) DESC
      `);

      const budgetResult = await db.execute(sql`SELECT user_id AS "userId", daily_limit_cents AS "dailyLimitCents" FROM "ai_cost_budget"`);
      const budgetMap = new Map((budgetResult.rows as Array<{ userId: string; dailyLimitCents: number }>).map((b) => [b.userId, b.dailyLimitCents]));

      const users = result.rows.map((r) => ({
        ...r,
        dailyBudgetCents: budgetMap.get(String(r.userId)) ?? 500,
      }));

      return Response.json({ users, days });
    }

    if (type === "tool-analytics") {
      const result = await db.execute(sql`
        SELECT
          tc.tool_name AS "toolName",
          count(*)::int AS "callCount",
          count(CASE WHEN tc.status = 'error' THEN 1 END)::int AS "errorCount",
          round(avg(tc.latency_ms))::int AS "avgLatencyMs"
        FROM "ai_tool_call" tc
        INNER JOIN ""ai_chat_turn"" ct ON tc.turn_id = ct.id
        WHERE ct.created_at >= now() - make_interval(days => ${days})
        GROUP BY tc.tool_name
        ORDER BY count(*) DESC
      `);

      return Response.json({ tools: result.rows, days });
    }

    if (type === "model-health") {
      const result = await db.execute(sql`
        SELECT
          count(*)::int AS "totalTurns",
          count(CASE WHEN ct.model_was_fallback = true THEN 1 END)::int AS "haikuCount",
          round(avg(ct.latency_ms))::int AS "avgLatencyMs"
        FROM "ai_chat_turn" ct
        WHERE ct.created_at >= now() - make_interval(days => ${days})
      `);

      const row = result.rows[0] as Record<string, unknown> | undefined;
      const sonnetCount = (Number(row?.totalTurns) || 0) - (Number(row?.haikuCount) || 0);

      return Response.json({
        sonnetCount,
        haikuCount: Number(row?.haikuCount) || 0,
        fallbackRate: Number(row?.totalTurns) > 0
          ? Math.round(((Number(row?.haikuCount) || 0) / Number(row?.totalTurns)) * 100)
          : 0,
        avgLatencyMs: Number(row?.avgLatencyMs) || 0,
        days,
      });
    }

    // Default: overview
    const result = await db.execute(sql`
      SELECT
        date,
        sum(request_count)::int AS "requests",
        sum(token_count_input)::int AS "tokensIn",
        sum(token_count_output)::int AS "tokensOut",
        sum(estimated_cost_cents)::int AS "costCents",
        sum(tool_call_count)::int AS "toolCalls",
        sum(error_count)::int AS "errors"
      FROM "ai_usage_metrics"
      WHERE date >= now() - make_interval(days => ${days})
      GROUP BY date
      ORDER BY date
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    const totals = {
      requests: rows.reduce((s, r) => s + Number(r.requests), 0),
      tokensIn: rows.reduce((s, r) => s + Number(r.tokensIn), 0),
      tokensOut: rows.reduce((s, r) => s + Number(r.tokensOut), 0),
      costCents: rows.reduce((s, r) => s + Number(r.costCents), 0),
      toolCalls: rows.reduce((s, r) => s + Number(r.toolCalls), 0),
      errors: rows.reduce((s, r) => s + Number(r.errors), 0),
    };

    return Response.json({ daily: rows, totals, days });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
