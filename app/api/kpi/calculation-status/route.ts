import { db } from "@/db/connection";
import { getCurrentUser } from "@/lib/user.service";
import { sql } from "drizzle-orm";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "DEV" && user.role !== "BMO") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));

    let whereClause = "";
    if (statusFilter) {
      whereClause = `WHERE status = '${statusFilter.replace(/'/g, "''")}'`;
    }

    const attemptsResult = await db.execute(sql.raw(`
      SELECT * FROM kpi_calculation_attempts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `));

    const summaryResult = await db.execute(sql`
      SELECT status, count(*)::int AS count
      FROM kpi_calculation_attempts GROUP BY status
    `);

    const byStatus: Record<string, number> = {};
    for (const row of summaryResult.rows as Array<{ status: string; count: number }>) {
      byStatus[row.status] = row.count;
    }

    return Response.json({
      attempts: attemptsResult.rows,
      summary: {
        pending: byStatus.pending ?? 0,
        inProgress: byStatus.in_progress ?? 0,
        failed: byStatus.failed ?? 0,
        completed: byStatus.completed ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "DEV" && user.role !== "BMO") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: { attemptIds: string[] };
  try { body = await request.json(); } catch {
    return Response.json({ message: "Invalid body" }, { status: 400 });
  }
  if (!Array.isArray(body.attemptIds) || body.attemptIds.length === 0) {
    return Response.json({ message: "attemptIds must be a non-empty array" }, { status: 400 });
  }

  try {
    const ids = body.attemptIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    await db.execute(sql.raw(`
      UPDATE kpi_calculation_attempts
      SET status = 'pending', retry_count = retry_count + 1,
          failure_reason = NULL, started_at = NULL, completed_at = NULL
      WHERE id IN (${ids}) AND status != 'in_progress'
    `));
    return Response.json({ retried: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
