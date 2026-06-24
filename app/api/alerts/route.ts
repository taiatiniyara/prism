import { db } from "@/db/connection";
import { alertRules, alertHistory, notifications } from "@/db/schema/alerting";
import { getCurrentUser } from "@/lib/user.service";
import { eq, desc } from "drizzle-orm";

// ── GET /api/alerts — list rules + history for DEV user ──

export async function GET(request: Request): Promise<Response> {
  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (path === "notifications") {
      const items = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, currentUser.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      return Response.json({ notifications: items, unreadCount: items.filter((n) => !n.read).length });
    }

    const rules = await db.select().from(alertRules).where(eq(alertRules.userId, currentUser.id));
    const historyResult = await db
      .select()
      .from(alertHistory)
      .innerJoin(alertRules, eq(alertHistory.ruleId, alertRules.id))
      .where(eq(alertRules.userId, currentUser.id))
      .orderBy(desc(alertHistory.triggeredAt))
      .limit(50);

    return Response.json({ rules, history: historyResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}

// ── POST /api/alerts — create rule or mark notifications read ──

export async function POST(request: Request): Promise<Response> {
  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    if (body.path === "mark-all-read") {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, currentUser.id));
      return Response.json({ ok: true });
    }

    // Create rule
    const [rule] = await db
      .insert(alertRules)
      .values({
        userId: currentUser.id,
        category: body.category ?? "error",
        severityFilter: body.severityFilter ?? null,
        threshold: body.threshold ?? null,
        cooldownMinutes: body.cooldownMinutes ?? 60,
        enabled: body.enabled ?? true,
      })
      .returning();

    return Response.json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
