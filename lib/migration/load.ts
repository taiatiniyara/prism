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

const messageOf = (e: unknown): string | undefined =>
  (e as { message?: string } | null | undefined)?.message;

// data_entries status ids (from dataEntry.ts DataEntryStatusId)
const STATUS_PENDING = 2; // empty shell, awaiting entry — the single starting state ("Requested" (1) retired)
const STATUS_ENTERED = 3; // filled

interface MeasureMeta {
  isActive: boolean;
  isCalculated: boolean;
  isMandatory: boolean; // core PPA measure — asserted_not_applicable is rejected on these
  col: string | null; // target value column from data_type
}

interface MeasureMetaRow {
  id: number;
  is_active: boolean;
  is_calculated: boolean;
  is_mandatory: boolean;
  data_type: string | null;
}

/** measure_id -> {is_active, is_calculated, is_mandatory, value column} (from data_type). */
async function getMeasureMeta(): Promise<Map<number, MeasureMeta>> {
  const rows = ((await db.execute(sql`
    SELECT m.id, m.is_active, m.is_calculated, m.is_mandatory, dt.name AS data_type
    FROM measure_definitions m LEFT JOIN managed_list_items dt ON dt.id=m.data_type_id`)).rows ?? []) as unknown as MeasureMetaRow[];
  const colFor = (dt: string | null): string | null => {
    const s = (dt ?? "").toLowerCase();
    if (s.includes("numeric") || s.includes("number")) return "value_numeric";
    if (s.includes("bool")) return "value_boolean";
    if (s.includes("option") || s.includes("list")) return "value_option_id";
    if (s.includes("text") || s.includes("string")) return "value_text";
    return null;
  };
  return new Map(rows.map((r) => [Number(r.id), { isActive: r.is_active, isCalculated: r.is_calculated, isMandatory: r.is_mandatory, col: colFor(r.data_type) }]));
}

function coerce(col: string, value: number | boolean | string): number | boolean | string {
  if (col === "value_numeric") return Number(value);
  if (col === "value_boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const s = String(value).trim().toLowerCase();
    return (
      s === "true" ||
      s === "1" ||
      s === "yes" ||
      s === "y" ||
      s === "t" ||
      s === "on"
    );
  }
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
  noDataAnswers: number; // rows loaded as a "no value + reason" answer (not_available / asserted_not_applicable)
  skipped: number; // inactive-measure rows, and any values omitted for calculated measures
}

/** Load one extract (already assigned a loadId via startLoad). */
export async function loadExtract(loadId: number, rows: ExtractRow[]): Promise<LoadResult> {
  const meta = await getMeasureMeta();
  // Valid p2 user ids — a migrated author that isn't a p2 user is nulled (+ soft-logged), never
  // failing the whole entry.
  const validUsers = new Set(
    (((await db.execute(sql`SELECT id FROM "user"`)).rows ?? []) as unknown as { id: string }[]).map(
      (u) => String(u.id),
    ),
  );
  const res: LoadResult = { total: rows.length, shellsCreated: 0, calculatedShells: 0, shellsFailed: 0, valuesFilled: 0, valuesFailed: 0, noDataAnswers: 0, skipped: 0 };

  // ── Twin-merge dedup ────────────────────────────────────────────────────────────────────────
  // The export can emit a blank "shell" row AND a value row for the SAME physical address. Collapse
  // each address to ONE row, preferring the value-bearing row so its value isn't discarded when a
  // blank twin wins the address race. Redundant/blank duplicates are recorded as shell rejections
  // (kept in the failed count so the shell balance still holds); genuinely DIFFERENT values at one
  // address are flagged as conflicts for manual resolution (the first is kept, the rest rejected).
  const addrKey = (r: ExtractRow): string =>
    [r.reportPeriodId, r.measureId, r.utilityId, r.serviceAreaId, r.powerStationId, r.unitId, r.countryId,
     r.dims.provider, r.dims.type, r.dims.source, r.dims.resource_type, r.dims.customer_type,
     r.dims.payment_mode, r.dims.band, r.dims.division, r.dims.gender, r.dims.utility_function]
      .map((x) => String(x ?? "")).join("|");
  // option value 0 = "no selection" sentinel → counts as blank for dedup (so a real option value
  // always beats a 0 twin, and 0-vs-value pairs aren't a false conflict).
  const optZero = (r: ExtractRow): boolean => r.valueType === "option" && Number(r.value) === 0;
  const hasVal = (r: ExtractRow): boolean => r.noDataReason != null || (r.value != null && r.value !== "" && !optZero(r));
  const normVal = (r: ExtractRow): string => (hasVal(r) ? (r.noDataReason ? `nd:${r.noDataReason}` : String(r.value).trim()) : "");

  const byAddr = new Map<string, ExtractRow[]>();
  for (const r of rows) { const k = addrKey(r); const g = byAddr.get(k); if (g) g.push(r); else byAddr.set(k, [r]); }
  const toLoad: ExtractRow[] = [];
  const dropped: { row: ExtractRow; reason: string; conflict: boolean }[] = [];
  for (const grp of byAddr.values()) {
    if (grp.length === 1) { toLoad.push(grp[0]); continue; }
    // Winner preference: a REAL value > not_available > blank. A concrete number is never dropped in
    // favour of a leftover "no data" shell at the same address. Two DIFFERENT real values are a genuine
    // conflict (kept the first, rest flagged); a value beating a not_available twin is not a conflict.
    const realValue = (r: ExtractRow): boolean => r.noDataReason == null && r.value != null && r.value !== "" && !optZero(r);
    const realValued = grp.filter(realValue);
    const noData = grp.filter((r) => r.noDataReason != null);
    const winner = realValued[0] ?? noData[0] ?? grp[0]; // real value > not_available > blank
    toLoad.push(winner);
    const distinctReal = new Set(realValued.map(normVal));
    for (const r of grp) {
      if (r === winner) continue;
      const isConflict = realValue(r) && distinctReal.size > 1;
      dropped.push({
        row: r, conflict: isConflict,
        reason: isConflict
          ? `CONFLICT — different value at the same address (kept "${normVal(winner)}", this row "${normVal(r)}") — resolve in the export`
          : realValue(r) ? "redundant duplicate row (same value) — safe to remove from the export"
          : r.noDataReason != null ? "not_available superseded by a real value at the same address (value kept)"
          : "redundant blank duplicate — the value-bearing twin was kept",
      });
    }
  }
  const DROP_CONC = 16;
  for (let i = 0; i < dropped.length; i += DROP_CONC) {
    await Promise.all(dropped.slice(i, i + DROP_CONC).map((d) =>
      recordRejection({ loadId, p1ReportPeriodId: d.row.reportPeriodId, measureDefId: d.row.measureId, sourcePayload: d.row, sourceSystem: "p1_extract", sourceRef: d.row.sourceRowId ?? undefined, stage: "shell", category: "unique", columns: [], reason: d.reason, remediation: d.conflict ? "two different values share one address — keep the correct one in the export" : "duplicate address in the export — remove the redundant row" })));
  }
  res.shellsFailed += dropped.length;

  const processRow = async (row: ExtractRow): Promise<void> => {
    const m = meta.get(row.measureId);
    const ctx = { loadId, p1ReportPeriodId: row.reportPeriodId, measureDefId: row.measureId, sourcePayload: row, sourceSystem: "p1_extract" as const, sourceRef: row.sourceRowId ?? undefined };

    // guards — measure must exist, be active, and be RAW (not calculated)
    if (!m) {
      await recordRejection({ ...ctx, stage: "shell", category: "unresolved_ref", columns: ["measure_def_id"], reason: `measure ${row.measureId} does not exist`, remediation: "fix measure_id in the extract or add the measure" });
      res.shellsFailed++; return;
    }
    // inactive measures are not collected — no shell expected; log stage-less (exclusion, not a failure)
    if (!m.isActive) { await recordRejection({ ...ctx, category: "other", columns: ["measure_def_id"], reason: "measure is inactive in p2 (not collected)", remediation: "exclude inactive measures, or activate the measure if it is needed" }); res.skipped++; return; }
    // NOTE: calculated measures DO get a shell — they are in the relevance/expected set, so the
    // per-utility shell balance holds. Their VALUE is never migrated (p2 calculators compute it);
    // that exclusion happens in Pass 2 below.

    // p1 provenance — resolve the original author (null + soft-log if not a p2 user) and build the
    // migrated note into the comments json (one DataEntryComment authored by that person).
    let authorId = row.updatedById != null && row.updatedById !== "" ? String(row.updatedById) : null;
    if (authorId && !validUsers.has(authorId)) {
      await recordRejection({ ...ctx, category: "other", columns: ["updated_by_id"], reason: `original author id "${authorId}" is not a p2 user — set to null`, remediation: "map the p1 person to a p2 user id, or leave blank" });
      authorId = null;
    }
    const commentsJson = row.comment
      ? JSON.stringify([{ comment: row.comment, commenterId: authorId, commenterRole: "migrated", date: row.updatedAt ?? null }])
      : null;

    // PASS 1 — shell (address only + p1 provenance)
    let shellId: string;
    try {
      const r = await db.execute(sql`
        INSERT INTO data_entries (
          report_period_id, measure_def_id,
          provider_id, category_id, technology_id, asset_class_id,
          customer_type_id, payment_mode_id, consumption_band_id, division_id, gender_id, utility_function_id,
          utility_id, service_area_id, power_station_id, unit_id, country_id,
          status_id, is_relevant, is_deleted,
          updated_by_id, updated_at, comments
        ) VALUES (
          ${row.reportPeriodId}, ${row.measureId},
          ${row.dims.provider}, ${row.dims.type}, ${row.dims.source}, ${row.dims.resource_type},
          ${row.dims.customer_type}, ${row.dims.payment_mode}, ${row.dims.band}, ${row.dims.division}, ${row.dims.gender}, ${row.dims.utility_function},
          ${row.utilityId ?? null}, ${row.serviceAreaId ?? null}, ${row.powerStationId ?? null}, ${row.unitId ?? null}, ${row.countryId ?? null},
          ${STATUS_PENDING}, true, false,
          ${authorId}, COALESCE(${row.updatedAt ?? null}::timestamp, now()), ${commentsJson}::json
        ) RETURNING id`);
      shellId = (r.rows[0] as { id: string }).id;
      res.shellsCreated++;
      if (m.isCalculated) res.calculatedShells++;
    } catch (e) {
      const c = classifyPgError(e);
      await recordRejection({ ...ctx, stage: "shell", category: c.category, columns: c.columns, rule: c.rule, reason: c.reason, remediation: shellRemediation(c.category), rawError: messageOf(e) });
      res.shellsFailed++; return;
    }

    // PASS 2 — value (if the row carries one)
    if (row.value != null && row.valueType) {
      // calculated measures: the value is computed in p2 by a calculator, never migrated —
      // the shell stays empty. If a value is present it's a data-hygiene slip: log it (stage-less,
      // so it doesn't hit the value balance) and move on.
      if (m.isCalculated) {
        await recordRejection({ ...ctx, category: "other", columns: [VALUETYPE_COL[row.valueType]], intendedValueType: row.valueType, reason: "calculated measure — value is computed in p2 by a calculator, not migrated; shell kept empty", remediation: "omit the value for calculated measures (pass the shell only)" });
        res.skipped++; return;
      }
      // option value 0 = "no selection" sentinel — treat as blank (no value migrated), not an FK error
      if (row.valueType === "option" && Number(row.value) === 0) {
        await recordRejection({ ...ctx, category: "other", columns: ["value_option_id"], intendedValueType: "option", reason: "option value 0 = no selection — treated as blank (no value migrated)", remediation: "leave the option blank in the export instead of 0" });
        res.skipped++; return;
      }
      const extractCol = VALUETYPE_COL[row.valueType];
      if (m.col && extractCol !== m.col) {
        await recordRejection({ ...ctx, stage: "value", category: "value_router", columns: [extractCol], intendedValueType: row.valueType, reason: `extract valueType "${row.valueType}" (${extractCol}) does not match the measure's data_type column (${m.col})`, remediation: "fix the value type in the extract or the measure's data_type" });
        res.valuesFailed++; return;
      }
      const col = m.col ?? extractCol;
      // Reject a non-numeric value headed for a numeric column instead of silently storing NaN
      // (a stored NaN poisons the value_sum fidelity line). e.g. "n/a", "nil", text in a number field.
      if (col === "value_numeric" && !Number.isFinite(Number(row.value))) {
        await recordRejection({ ...ctx, stage: "value", category: "type_cast", columns: [col], intendedValueType: row.valueType, reason: `numeric value ${JSON.stringify(String(row.value))} is not a number (would store as NaN)`, remediation: "supply a real number, or leave the value blank and set no_data_reason=not_available" });
        res.valuesFailed++; return;
      }
      try {
        const v = coerce(col, row.value);
        // NB: do NOT touch updated_at here — the shell insert set the ORIGINAL p1 entry time,
        // which migration must preserve (not the load run time).
        await db.execute(sql`UPDATE data_entries SET ${sql.raw(col)} = ${v}, status_id = ${row.statusId ?? STATUS_ENTERED} WHERE id = ${shellId}`);
        res.valuesFilled++;
      } catch (e) {
        const c = classifyPgError(e);
        await recordRejection({ ...ctx, stage: "value", category: c.category, columns: c.columns.length ? c.columns : [col], rule: c.rule, intendedValueType: row.valueType, attemptedNumeric: row.valueType === "numeric" ? Number(row.value) : null, reason: c.reason, remediation: "check the value against the measure's type / valid range", rawError: messageOf(e) });
        res.valuesFailed++;
      }
    }
    // PASS 2 (alt) — a "no value + reason" answer (not_available / asserted_not_applicable)
    else if (row.noDataReason) {
      // calculated measures carry no entered answer — availability is a p2 compute concern.
      if (m.isCalculated) {
        await recordRejection({ ...ctx, category: "other", columns: ["no_data_reason"], reason: "calculated measure — availability is computed in p2, not migrated; shell kept empty", remediation: "omit no_data_reason for calculated measures" });
        res.skipped++; return;
      }
      // Mandatory gate (data-availability §3.1 rule b): "doesn't apply to us" is invalid on a
      // mandatory measure — the only honest no-data answer there is not_available (a visible gap).
      // The writer enforces this for the bulk/migration path, not just the UI.
      if (row.noDataReason === "asserted_not_applicable" && m.isMandatory) {
        await recordRejection({ ...ctx, stage: "value", category: "other", columns: ["no_data_reason"], reason: "asserted_not_applicable is not allowed on a mandatory measure — record not_available (a visible gap), or fix relevance via the BMO registry", remediation: "mandatory measure with no data: use not_available; genuine inapplicability is a relevance-registry decision, not an assertion" });
        res.valuesFailed++; return;
      }
      try {
        // NB: leave updated_at as PASS 1 set it (original p1 time preserved).
        await db.execute(sql`UPDATE data_entries SET no_data_reason = ${row.noDataReason}, status_id = ${row.statusId ?? STATUS_ENTERED} WHERE id = ${shellId}`);
        res.noDataAnswers++;
      } catch (e) {
        const c = classifyPgError(e);
        await recordRejection({ ...ctx, stage: "value", category: c.category, columns: c.columns.length ? c.columns : ["no_data_reason"], reason: c.reason, remediation: "check no_data_reason vs chk_no_data_reason / chk_value_xor_nodata", rawError: messageOf(e) });
        res.valuesFailed++;
      }
    }
  };

  // Bounded concurrency: run rows in pool-capped batches so a 21k-row load finishes in ~a minute
  // instead of ~20 (the cost was purely serial round-trips, not DB work). Each row keeps its exact
  // two-pass logic + rejection attribution; JS async is single-threaded, so the shared `res`
  // counters and the rejection ledger stay consistent. Cap at the PG pool size to avoid queueing.
  const CONCURRENCY = Math.max(1, Number(process.env.MIGRATE_CONCURRENCY ?? "16"));
  for (let i = 0; i < toLoad.length; i += CONCURRENCY) {
    await Promise.all(toLoad.slice(i, i + CONCURRENCY).map((row) => processRow(row)));
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
