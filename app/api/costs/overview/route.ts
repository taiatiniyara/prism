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
  const interval = `${days} days`;

  try {
    const dailyResult = await db.execute(sql`
      SELECT date, sum(estimated_cost_cents)::int AS "costCents"
      FROM ai_usage_metrics WHERE date >= now() - interval '${interval}'
      GROUP BY date ORDER BY date
    `);
    const rows = dailyResult.rows as Array<{ costCents: number; date: string }>;
    const totalSpendCents = rows.reduce((s, r) => s + Number(r.costCents), 0);

    const utilityResult = await db.execute(sql`
      SELECT o.id AS "utilityId", o.name AS "utilityName",
        sum(m.estimated_cost_cents)::int AS "spendCents",
        sum(m.request_count)::int AS "requestCount"
      FROM ai_usage_metrics m
      INNER JOIN "user" u ON m.user_id = u.id
      INNER JOIN organisations o ON u.organisation_id = o.id
      WHERE m.date >= now() - interval '${interval}'
      GROUP BY o.id, o.name ORDER BY sum(m.estimated_cost_cents) DESC
    `);

    const dailyArr = rows.map((d) => ({ date: String(d.date), costCents: Number(d.costCents) }));
    const anomalies = dailyArr.map((d, i) => {
      if (i < 7) return null;
      const w = dailyArr.slice(i - 7, i);
      const avg = w.reduce((s, x) => s + x.costCents, 0) / w.length;
      if (avg > 0 && d.costCents > avg * 2) {
        return { date: d.date, costCents: d.costCents, avg7dCents: Math.round(avg), ratio: Math.round((d.costCents / avg) * 10) / 10 };
      }
      return null;
    }).filter(Boolean);

    const budgetResult = await db.execute(sql`SELECT avg(daily_limit_cents)::int AS "dailyLimitCents" FROM ai_cost_budget`);
    const budgetRow = budgetResult.rows[0] as { dailyLimitCents: number } | undefined;
    const budgetLimitCents = Number(budgetRow?.dailyLimitCents) || 500;

    const todayResult = await db.execute(sql`
      SELECT sum(estimated_cost_cents)::int AS "costCents"
      FROM ai_usage_metrics       WHERE date >= now()::date
    `);
    const todayRow = todayResult.rows[0] as { costCents: number } | undefined;

    return Response.json({
      totalSpendCents, daily: dailyArr, anomalies,
      byUtility: utilityResult.rows,
      budget: {
        dailyLimitCents: budgetLimitCents,
        todaySpendCents: Number(todayRow?.costCents) || 0,
        todayOverBudget: (Number(todayRow?.costCents) || 0) > budgetLimitCents,
      },
      days,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
