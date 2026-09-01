import { db } from "@/db/connection";
import { backupLogs } from "@/db/schema/backup-log";
import { getCurrentUser } from "@/lib/user.service";
import { desc, sql } from "drizzle-orm";

const WARN_HOURS = Number(process.env.BACKUP_WARN_HOURS ?? "24");

export async function GET(_request: Request): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const [lastBackup] = await db
      .select()
      .from(backupLogs)
      .orderBy(desc(backupLogs.createdAt))
      .limit(1);

    const now = new Date();
    const ageHours = lastBackup
      ? Math.round((now.getTime() - lastBackup.createdAt.getTime()) / 3600000)
      : null;

    // Table row estimates via pg_stat_user_tables
    let tableSizes: { name: string; rowEstimate: number }[] = [];
    try {
      const rows = await db.execute(sql`
        SELECT relname AS name, n_live_tup AS "rowEstimate"
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
        LIMIT 20
      `);
      tableSizes = (rows as unknown as { name: string; rowEstimate: number }[]).map((r) => ({
        name: r.name,
        rowEstimate: Number(r.rowEstimate) || 0,
      }));
    } catch {
      // pg_stat_user_tables may not be accessible
    }

    // Orphan check: stale sessions past expiry
    let staleSessions = 0;
    try {
      const [result] = await db.execute(sql`
        SELECT count(*)::int AS count FROM session WHERE expires_at < now()
      `) as unknown as [{ count: number }];
      staleSessions = result?.count ?? 0;
    } catch { /* */ }

    return Response.json({
      lastBackup: lastBackup ? {
        at: lastBackup.createdAt,
        sizeBytes: lastBackup.fileSizeBytes,
        ageHours,
        success: lastBackup.success,
        message: lastBackup.errorMessage,
      } : null,
      backupAgeWarnHours: WARN_HOURS,
      backupOk: lastBackup ? lastBackup.success && ageHours !== null && ageHours < WARN_HOURS : false,
      tableSizes,
      orphans: { staleSessions },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
