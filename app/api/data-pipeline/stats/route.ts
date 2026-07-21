import { db } from "@/db/connection";
import { getCurrentUser } from "@/lib/user.service";
import { sql } from "drizzle-orm";

const STUCK_DAYS = Number(process.env.PIPELINE_STUCK_DAYS ?? "30");

export async function GET(_request: Request): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "DEV" && user.role !== "BMO") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const stuckDays = STUCK_DAYS;

    const statusResult = await db.execute(sql`
      SELECT status_id AS "statusId", count(*)::int AS count
      FROM data_entries WHERE is_deleted = false GROUP BY status_id
    `);
    const srows = statusResult.rows as Array<{
      statusId: number;
      count: number;
    }>;
    const statusMap: Record<number, number> = {};
    let total = 0;
    for (const row of srows) {
      statusMap[row.statusId] = row.count;
      total += row.count;
    }
    const completed = (statusMap[6] ?? 0) + (statusMap[7] ?? 0);

    const stuckResult = await db.execute(sql`
      SELECT id, measure_def_id AS "inputDefId", status_id AS "statusId",
        service_area_id AS "serviceAreaId", report_period_id AS "reportPeriodId",
        updated_at AS "updatedAt"
      FROM data_entries
      WHERE is_deleted = false AND status_id NOT IN (6, 7) AND updated_at < now() - interval '${stuckDays} days'
      LIMIT 200
    `);

    const orgResult = await db.execute(sql`
      SELECT id, name FROM organisations WHERE is_utility = true
    `);

    return Response.json({
      statusCounts: {
        requested: statusMap[1] ?? 0,
        pending: statusMap[2] ?? 0,
        entered: statusMap[3] ?? 0,
        reviewed: statusMap[4] ?? 0,
        approved: statusMap[5] ?? 0,
        endorsed: statusMap[6] ?? 0,
        notAvailable: statusMap[7] ?? 0,
      },
      totalEntries: total,
      completedPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      stuckCount: stuckResult.rows.length,
      stuckEntries: stuckResult.rows,
      utilities: orgResult.rows,
      stuckThresholdDays: STUCK_DAYS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
