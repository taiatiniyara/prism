import { assertMigrationKey } from "../prism-training/_lib";
import { db } from "@/db/connection";
import { tariffRelevance } from "@/db/schema/dataEntry";
import { eq, gt, and, asc } from "drizzle-orm";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

function parseIntParam(value: string | null, fallback?: number): number | null {
  if (value == null) return fallback ?? null;
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback ?? null);
}

export async function GET(request: Request) {
  assertMigrationKey(request);

  const { searchParams } = new URL(request.url);
  const reportPeriodId = parseIntParam(searchParams.get("reportPeriodId"));
  const serviceAreaId = parseIntParam(searchParams.get("serviceAreaId"));
  const inputDefId = parseIntParam(searchParams.get("inputDefId"));
  const cursor = searchParams.get("cursor");
  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const rawLimit = parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, rawLimit ?? DEFAULT_LIMIT));

  const conditions = [];
  if (reportPeriodId != null)
    conditions.push(eq(tariffRelevance.report_period_id, reportPeriodId));
  if (serviceAreaId != null)
    conditions.push(eq(tariffRelevance.service_area_id, serviceAreaId));
  if (inputDefId != null)
    conditions.push(eq(tariffRelevance.measure_def_id, inputDefId));
  if (!includeDeleted) conditions.push(eq(tariffRelevance.is_deleted, false));
  if (cursor != null) conditions.push(gt(tariffRelevance.id, cursor));

  const rows = await db
    .select()
    .from(tariffRelevance)
    .where(and(...conditions))
    .orderBy(asc(tariffRelevance.id))
    .limit(limit);

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null;

  return Response.json({
    tariffRelevance: rows.map((r) => ({
      id: r.id,
      report_period_id: r.report_period_id,
      service_area_id: r.service_area_id,
      measure_def_id: r.measure_def_id,
      payment_mode_id: r.payment_mode_id,
      customer_type_id: r.customer_type_id,
      is_relevant: r.is_relevant,
      is_deleted: r.is_deleted,
      updated_at: r.updatedAt,
      updated_by_id: r.updatedById,
    })),
    pagination: {
      nextCursor,
      hasMore: rows.length === limit,
      returned: rows.length,
    },
  });
}
