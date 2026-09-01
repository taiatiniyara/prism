import { assertMigrationKey } from "../prism-training/_lib";
import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
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
  const inputDefId = parseIntParam(searchParams.get("inputDefId"));
  const statusId = parseIntParam(searchParams.get("statusId"));
  const cursor = searchParams.get("cursor");
  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const rawLimit = parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, rawLimit ?? DEFAULT_LIMIT));

  const conditions = [];
  if (reportPeriodId != null)
    conditions.push(eq(dataEntries.report_period_id, reportPeriodId));
  if (inputDefId != null)
    conditions.push(eq(dataEntries.measure_def_id, inputDefId));
  if (statusId != null) conditions.push(eq(dataEntries.status_id, statusId));
  if (!includeDeleted) conditions.push(eq(dataEntries.is_deleted, false));
  if (cursor != null) conditions.push(gt(dataEntries.id, cursor));

  const rows = await db
    .select()
    .from(dataEntries)
    .where(and(...conditions))
    .orderBy(asc(dataEntries.id))
    .limit(limit);

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null;

  return Response.json({
    dataEntry: rows.map((d) => ({
      id: d.id,
      report_period_id: d.report_period_id,
      unit_id: d.unit_id,
      service_area_id: d.service_area_id,
      measure_def_id: d.measure_def_id,
      value: d.value,
      comments: d.comments,
      update_medium_id: d.update_medium_id,
      status_id: d.status_id,
      is_relevant: d.is_relevant,
      is_deleted: d.is_deleted,
      provider_id: d.provider_id,
      technology_id: d.technology_id,
      customer_type_id: d.customer_type_id,
      payment_mode_id: d.payment_mode_id,
      updated_at: d.updatedAt,
      updated_by_id: d.updatedById,
    })),
    pagination: {
      nextCursor,
      hasMore: rows.length === limit,
      returned: rows.length,
    },
  });
}
