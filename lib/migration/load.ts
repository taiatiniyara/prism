import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { recordRejection, classifyPgError } from "./rejections";
import type { ExtractRow, ValueType } from "./types";

/**
 * Core two-pass loader. Per row: insert the shell (address only), then fill the value if present.
 * Splitting shell vs value keeps the scorecard's two stages clean — a shell failure is an address
 * problem, a value failure is a typing problem. On any DB error the row is recorded in
 * migration_rejections (never silently dropped) and the loader continues.
 *
 * The extract is already resolved to p2 ids (see types.ts), so there is no map/period/grain
 * resolution here — validate, insert, reconcile.
 */

const VALUETYPE_COL: Record<ValueType, string> = {
  numeric: "value_numeric",
  boolean: "value_boolean",
  text: "value_text",
  option: "value_option_id",
};

// data_entries status ids (from dataEntry.ts DataEntryStatusId)
const STATUS_REQUESTED = 1; // empty shell, awaiting entry
const STATUS_ENTERED = 3; // filled

interface MeasureMeta {
  isActive: boolean;
  isCalculated: boolean;
  col: string | null; // target value column from data_type
}

/** measure_id -> {is_active, is_calculated, value column} (from data_type). */
async function getMeasureMeta(): Promise<Map<number, MeasureMeta>> {
  const rows = ((await db.execute(sql`
    SELECT m.id, m.is_active, m.is_calculated, dt.name AS data_type
    FROM measure_definitions m LEFT JOIN managed_list_items dt ON dt.id=m.data_type_id`)).rows ?? []) as any[];
  const colFor = (dt: string | null): string | null => {
    const s = (dt ?? "").toLowerCase();
    if (s.includes("numeric") || s.includes("number")) return "value_numeric";
    if (s.includes("bool")) return "value_boolean";
    if (s.includes("option") || s.includes("list")) return "value_option_id";
    if (s.includes("text") || s.includes("string")) return "value_text";
    return null;
  };
  return new Map(rows.map((r) => [Number(r.id), { isActive: r.is_active, isCalculated: r.is_calculated, col: colFor(r.data_type) }]));
}

function coerce(col: string, value: number | boolean | string): number | boolean | string {
  if (col === "value_numeric") return Number(value);
  if (col === "value_boolean") return value === true || value === "true" || value === 1 || value === "1";
  if (col === "value_option_id") return Number(value);
  return String(value);
}

export interface LoadResult {
  total: number;
  shellsCreated: number; // includes calculated-measure shells (they're in the expected set)
  calculatedShells: number; // subset: empty shells for calculated measures (value computed in p2)
  shellsFailed: number;
  valuesFilled: number;
  valuesFailed: number;
  skipped: number; // inactive-measure rows, and any values omitted for calculated measures
}

/** Load one extract (already assigned a loadId via startLoad). */
export async function loadExtract(loadId: number, rows: ExtractRow[]): Promise<LoadResult> {
  const meta = await getMeasureMeta();
  const res: LoadResult = { total: rows.length, shellsCreated: 0, calculatedShells: 0, shellsFailed: 0, valuesFilled: 0, valuesFailed: 0, skipped: 0 };

  for (const row of rows) {
    const m = meta.get(row.measureId);
    const ctx = { loadId, p1ReportPeriodId: row.reportPeriodId, measureDefId: row.measureId, sourcePayload: row, sourceSystem: "p1_extract" as const };

    // guards — measure must exist, be active, and be RAW (not calculated)
    if (!m) {
      await recordRejection({ ...ctx, stage: "shell", category: "unresolved_ref", columns: ["measure_def_id"], reason: `measure ${row.measureId} does not exist`, remediation: "fix measure_id in the extract or add the measure" });
      res.shellsFailed++; continue;
    }
    // inactive measures are not collected — no shell expected; log stage-less (exclusion, not a failure)
    if (!m.isActive) { await recordRejection({ ...ctx, category: "other", columns: ["measure_def_id"], reason: "measure is inactive in p2 (not collected)", remediation: "exclude inactive measures, or activate the measure if it is needed" }); res.skipped++; continue; }
    // NOTE: calculated measures DO get a shell — they are in the relevance/expected set, so the
    // per-utility shell balance holds. Their VALUE is never migrated (p2 calculators compute it);
    // that exclusion happens in Pass 2 below.

    // PASS 1 — shell (address only)
    let shellId: string;
    try {
      const r = await db.execute(sql`
        INSERT INTO data_entries (
          report_period_id, measure_def_id,
          provider_id, category_id, technology_id, asset_id,
          customer_type_id, payment_mode_id, consumption_band_id, division_id, gender_id, utility_function_id,
          utility_id, service_area_id, power_station_id, unit_id, country_id,
          status_id, is_relevant, is_deleted
        ) VALUES (
          ${row.reportPeriodId}, ${row.measureId},
          ${row.dims.provider}, ${row.dims.type}, ${row.dims.source}, ${row.dims.resource_type},
          ${row.dims.customer_type}, ${row.dims.payment_mode}, ${row.dims.band}, ${row.dims.division}, ${row.dims.gender}, ${row.dims.utility_function},
          ${row.utilityId ?? null}, ${row.serviceAreaId ?? null}, ${row.powerStationId ?? null}, ${row.energyResourceId ?? null}, ${row.countryId ?? null},
          ${STATUS_REQUESTED}, true, false
        ) RETURNING id`);
      shellId = (r.rows[0] as any).id;
      res.shellsCreated++;
      if (m.isCalculated) res.calculatedShells++;
    } catch (e) {
      const c = classifyPgError(e);
      await recordRejection({ ...ctx, stage: "shell", category: c.category, columns: c.columns, rule: c.rule, reason: c.reason, remediation: shellRemediation(c.category), rawError: (e as any)?.message });
      res.shellsFailed++; continue;
    }

    // PASS 2 — value (if the row carries one)
    if (row.value != null && row.valueType) {
      // calculated measures: the value is computed in p2 by a calculator, never migrated —
      // the shell stays empty. If a value is present it's a data-hygiene slip: log it (stage-less,
      // so it doesn't hit the value balance) and move on.
      if (m.isCalculated) {
        await recordRejection({ ...ctx, category: "other", columns: [VALUETYPE_COL[row.valueType]], intendedValueType: row.valueType, reason: "calculated measure — value is computed in p2 by a calculator, not migrated; shell kept empty", remediation: "omit the value for calculated measures (pass the shell only)" });
        res.skipped++; continue;
      }
      const extractCol = VALUETYPE_COL[row.valueType];
      if (m.col && extractCol !== m.col) {
        await recordRejection({ ...ctx, stage: "value", category: "value_router", columns: [extractCol], intendedValueType: row.valueType, reason: `extract valueType "${row.valueType}" (${extractCol}) does not match the measure's data_type column (${m.col})`, remediation: "fix the value type in the extract or the measure's data_type" });
        res.valuesFailed++; continue;
      }
      const col = m.col ?? extractCol;
      try {
        const v = coerce(col, row.value);
        await db.execute(sql`UPDATE data_entries SET ${sql.raw(col)} = ${v as any}, status_id = ${row.statusId ?? STATUS_ENTERED}, updated_at = now() WHERE id = ${shellId}`);
        res.valuesFilled++;
      } catch (e) {
        const c = classifyPgError(e);
        await recordRejection({ ...ctx, stage: "value", category: c.category, columns: c.columns.length ? c.columns : [col], rule: c.rule, intendedValueType: row.valueType, attemptedNumeric: row.valueType === "numeric" ? Number(row.value) : null, reason: c.reason, remediation: "check the value against the measure's type / valid range", rawError: (e as any)?.message });
        res.valuesFailed++;
      }
    }
  }
  return res;
}

function shellRemediation(cat: string): string {
  switch (cat) {
    case "not_null": return "a required dimension is null — the extract must carry all 10 dimension members (All-member where not sliced)";
    case "unique": return "duplicate physical address — two rows resolve to the same period+measure+dims+grain; dedupe in the extract";
    case "fk": return "a referenced id (dimension member or grain) does not exist in p2 — verify the id";
    default: return "inspect the address; see raw_error";
  }
}
