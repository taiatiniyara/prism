import { db } from "@/db/connection";
import { session, user, roles } from "@/db/schema/auth-schema";
import { auditLogs } from "@/db/schema/audit-log";
import { getCurrentUser } from "@/lib/user.service";
import { sql, eq, gt, desc } from "drizzle-orm";

export async function GET(_request: Request): Promise<Response> {
  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    // Failed logins
    const [recentFails] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs)
      .where(sql`action = 'auth.login_failed' AND created_at >= now() - interval '1 hour'`);
    const [dailyFails] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs)
      .where(sql`action = 'auth.login_failed' AND created_at >= now() - interval '24 hours'`);

    const currentHour = Number(recentFails?.count) || 0;
    const dailyTotal = Number(dailyFails?.count) || 0;
    const avgHourly = Math.round(dailyTotal / 24);
    const isSpike = avgHourly > 0 && currentHour > avgHourly * 2;

    // Active sessions using drizzle query builder (known to work)
    const activeSessions = await db
      .select({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        userEmail: user.email,
        userRole: roles.name,
      })
      .from(session)
      .leftJoin(user, eq(session.userId, user.id))
      .leftJoin(roles, eq(user.role_id, roles.id))
      .where(gt(session.expiresAt, sql`now()`))
      .orderBy(desc(session.createdAt))
      .limit(100);

    // Recent role changes
    const roleChanges = await db.select().from(auditLogs)
      .where(sql`action = 'user.role_change' AND created_at >= now() - interval '7 days'`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    // Registration funnel
    const funnel = await db.execute(sql`
      SELECT count(CASE WHEN status = 'active' THEN 1 END)::int AS active,
        count(CASE WHEN status = 'pending' THEN 1 END)::int AS pending,
        count(CASE WHEN status = 'deactivated' THEN 1 END)::int AS deactivated
      FROM "user"
    `);

    return Response.json({
      failedLoginSpike: { currentHour, avgHourly, dailyTotal, isSpike },
      activeSessions,
      activeSessionCount: activeSessions.length,
      roleChanges,
      registrationFunnel: (funnel?.rows?.[0] as { active: number; pending: number; deactivated: number } ?? { active: 0, pending: 0, deactivated: 0 }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
