import { db } from "@/db/connection";
import { errorLogs } from "@/db/schema/error-log";
import { getCurrentUser } from "@/lib/user.service";
import { desc, eq, and, gte, lte, sql, isNull } from "drizzle-orm";

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
  const severity = searchParams.get("severity");
  const source = searchParams.get("source");
  const errorType = searchParams.get("errorType");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const includeResolved = searchParams.get("includeResolved") === "true";
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const conditions = [];

  if (!includeResolved) {
    conditions.push(isNull(errorLogs.resolvedAt));
  }
  if (severity) {
    conditions.push(eq(errorLogs.severity, severity));
  }
  if (source) {
    conditions.push(eq(errorLogs.source, source));
  }
  if (errorType) {
    conditions.push(eq(errorLogs.errorType, errorType));
  }
  if (from) {
    conditions.push(gte(errorLogs.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(errorLogs.createdAt, new Date(to)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [errors, stats] = await Promise.all([
    db
      .select()
      .from(errorLogs)
      .where(where)
      .orderBy(desc(errorLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        severity: errorLogs.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(errorLogs)
      .where(where)
      .groupBy(errorLogs.severity),
  ]);

  const bySeverity: Record<string, number> = {};
  for (const row of stats) {
    bySeverity[row.severity] = row.count;
  }

  const total = stats.reduce((sum, row) => sum + row.count, 0);

  return Response.json({ errors, stats: { total, bySeverity }, offset, limit });
}

export async function PATCH(request: Request): Promise<Response> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: { ids: number[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return Response.json({ message: "ids must be a non-empty array of integers" }, { status: 400 });
  }

  await db
    .update(errorLogs)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        ...body.ids.map((id) => eq(errorLogs.id, id)),
        isNull(errorLogs.resolvedAt),
      ),
    );

  return Response.json({ resolved: true });
}
