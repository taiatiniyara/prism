import { db } from "@/db/connection";
import { auditLogs } from "@/db/schema/audit-log";
import { getCurrentUser } from "@/lib/user.service";
import { desc, eq, and, gte, lte, sql, like } from "drizzle-orm";

export async function GET(request: Request): Promise<Response> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "DEV" && user.role !== "BMO") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const action = searchParams.get("action");
  const actor = searchParams.get("actor");
  const target = searchParams.get("target");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const conditions = [];

  if (action) {
    conditions.push(like(auditLogs.action, `${action}%`));
  }
  if (actor) {
    conditions.push(eq(auditLogs.actorEmail, actor));
  }
  if (target) {
    conditions.push(eq(auditLogs.targetId, target));
  }
  if (from) {
    conditions.push(gte(auditLogs.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(auditLogs.createdAt, new Date(to)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [events, totalResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;

  if (format === "csv") {
    const headers = ["id", "action", "actor_email", "actor_role", "target_type", "target_id", "details", "ip_address", "created_at"];
    const rows = events.map((e) =>
      headers.map((h) => {
        const val = (e as Record<string, unknown>)[h === "actor_email" ? "actorEmail" : h === "actor_role" ? "actorRole" : h === "target_type" ? "targetType" : h === "target_id" ? "targetId" : h === "ip_address" ? "ipAddress" : h === "created_at" ? "createdAt" : h];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      }).map((v) => `"${v.replace(/"/g, '""')}"`).join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=audit-logs.csv" },
    });
  }

  return Response.json({ events, total, offset, limit });
}
