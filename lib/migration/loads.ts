import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import {
  migrationLoads,
  type MigrationLoadStatus,
} from "@/db/schema/migrationLoads";
import {
  migrationScorecard,
  type NewMigrationScorecard,
} from "@/db/schema/migrationScorecard";
import { migrationRejections } from "@/db/schema/migrationRejections";
import { APPROVED_STATUS } from "@/db/schema/dataEntry";

/**
 * Migration load lifecycle + scorecard reconciliation.
 *
 * Usage:
 *   const loadId = await startLoad({ label });      // resets ledgers, mints the load_id
 *   ... run the load, recordRejection({ loadId, ... }) on failures ...
 *   for (const c of controlTotals) await reconcilePeriod(loadId, c);  // build the scorecard
 *   const anomalies = await getAnomalies(loadId);   // balance_expected AND NOT is_balanced
 *   await finishLoad(loadId, anomalies.length ? "completed" : "completed");
 */

/** Begin a load run: mint an auto-incrementing load_id and reset the per-run ledgers. */
export async function startLoad(opts?: {
  label?: string;
  sourceSystem?: string;
  notes?: string;
}): Promise<number> {
  const [row] = await db
    .insert(migrationLoads)
    .values({
      label: opts?.label ?? null,
      source_system: opts?.sourceSystem ?? null,
      notes: opts?.notes ?? null,
    })
    .returning({ id: migrationLoads.id });
  const loadId = row.id;
  // Rejections + scorecard are TAGGED by load_id and RETAINED across runs, so variance can be
  // compared iteration-by-iteration (scripts/migration-status.ts). Only clear THIS load's own rows
  // (a no-op for a fresh loadId; makes a re-run of the same id idempotent). For a full clean slate
  // — clearing all history — use scripts/reset-migration.ts.
  await db.delete(migrationRejections).where(eq(migrationRejections.load_id, loadId));
  await db.delete(migrationScorecard).where(eq(migrationScorecard.load_id, loadId));
  return loadId;
}

/** Close a load run, stamping status + roll-up counts from the scorecard 'total' lines. */
export async function finishLoad(
  loadId: number,
  status: MigrationLoadStatus = "completed",
): Promise<void> {
  const t = (
    (
      await db.execute(sql`
        SELECT
          COALESCE(sum(source)   FILTER (WHERE recon_line='value' AND value_type='total'), 0) AS rows_in,
          COALESCE(sum(migrated) FILTER (WHERE recon_line='value' AND value_type='total'), 0) AS rows_migrated,
          COALESCE(sum(failed)   FILTER (WHERE recon_line='value' AND value_type='total'), 0) AS rows_failed
        FROM migration_scorecard WHERE load_id=${loadId}`)
    ).rows ?? []
  )[0] as { rows_in: string; rows_migrated: string; rows_failed: string };
  await db
    .update(migrationLoads)
    .set({
      status,
      finished_at: sql`now()`,
      rows_in: Math.round(Number(t?.rows_in ?? 0)),
      rows_migrated: Math.round(Number(t?.rows_migrated ?? 0)),
      rows_failed: Math.round(Number(t?.rows_failed ?? 0)),
    })
    .where(eq(migrationLoads.id, loadId));
}

/** One row from the p1 control-totals sheet, plus the resolved p2 report_period_id. */
export interface ControlTotals {
  p1ReportPeriodId: number;
  reportPeriodId: number; // resolved p2 report_periods.id
  periodLabel?: string;
  relevanceRecords: number;
  valuesNumeric: number;
  valuesBoolean: number;
  valuesText: number;
  valuesOption: number;
  sumValueNumeric: number | string;
  valuesNoncalcUnfiltered: number;
  valuesCalculated: number;
}

/**
 * Build the scorecard lines for ONE report_period by reconciling the p1 control totals
 * against what actually landed (data_entries) and what failed (migration_rejections).
 * The migrated side is read from the DB, not the loader's self-report, so it reflects reality.
 * Assumes flush-and-reload: all data_entries rows for the period belong to this load.
 */
export async function reconcilePeriod(
  loadId: number,
  c: ControlTotals,
): Promise<void> {
  // migrated side — from data_entries (every row is a shell; filled = a value column set).
  // Joined to measure_definitions so calculated shells (empty, value computed in p2) can be
  // separated from raw shells awaiting entry.
  const m = (
    (
      await db.execute(sql`
        SELECT
          count(*)::int AS shells,
          count(*) FILTER (WHERE de.value_numeric   IS NOT NULL)::int AS v_numeric,
          count(*) FILTER (WHERE de.value_boolean   IS NOT NULL)::int AS v_boolean,
          count(*) FILTER (WHERE de.value_text      IS NOT NULL)::int AS v_text,
          count(*) FILTER (WHERE de.value_option_id IS NOT NULL)::int AS v_option,
          count(*) FILTER (WHERE de.value_numeric IS NOT NULL OR de.value_boolean IS NOT NULL
                             OR de.value_text IS NOT NULL OR de.value_option_id IS NOT NULL)::int AS v_total,
          count(*) FILTER (WHERE md.is_calculated)::int AS calc_shells,
          COALESCE(sum(de.value_numeric), 0) AS sum_numeric
        FROM data_entries de JOIN measure_definitions md ON md.id = de.measure_def_id
        WHERE de.report_period_id = ${c.reportPeriodId}`)
    ).rows ?? []
  )[0] as Record<string, number | string>;

  // failed side — from migration_rejections, split by stage + intended value type
  const f = (
    (
      await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE stage='shell')::int AS shell_failed,
          count(*) FILTER (WHERE stage='value' AND intended_value_type='numeric')::int AS vf_numeric,
          count(*) FILTER (WHERE stage='value' AND intended_value_type='boolean')::int AS vf_boolean,
          count(*) FILTER (WHERE stage='value' AND intended_value_type='text')::int    AS vf_text,
          count(*) FILTER (WHERE stage='value' AND intended_value_type='option')::int  AS vf_option,
          count(*) FILTER (WHERE stage='value')::int AS vf_total,
          COALESCE(sum(attempted_numeric) FILTER (WHERE stage='value' AND intended_value_type='numeric'), 0) AS vf_sum_numeric
        FROM migration_rejections
        WHERE load_id = ${loadId} AND p1_report_period_id = ${c.p1ReportPeriodId}`)
    ).rows ?? []
  )[0] as Record<string, number | string>;

  const valuesTotalIn =
    c.valuesNumeric + c.valuesBoolean + c.valuesText + c.valuesOption;

  const base = {
    load_id: loadId,
    p1_report_period_id: c.p1ReportPeriodId,
    report_period_id: c.reportPeriodId,
    period_label: c.periodLabel ?? null,
  };
  const N = (v: number | string) => String(v);

  const lines: NewMigrationScorecard[] = [
    // SHELL: relevance = shells_created + shells_failed
    { ...base, recon_line: "shell", value_type: "na", source: N(c.relevanceRecords), migrated: N(m.shells), failed: N(f.shell_failed) },
    // VALUE by type: values_in = migrated + failed
    { ...base, recon_line: "value", value_type: "numeric", source: N(c.valuesNumeric), migrated: N(m.v_numeric), failed: N(f.vf_numeric) },
    { ...base, recon_line: "value", value_type: "boolean", source: N(c.valuesBoolean), migrated: N(m.v_boolean), failed: N(f.vf_boolean) },
    { ...base, recon_line: "value", value_type: "text", source: N(c.valuesText), migrated: N(m.v_text), failed: N(f.vf_text) },
    { ...base, recon_line: "value", value_type: "option", source: N(c.valuesOption), migrated: N(m.v_option), failed: N(f.vf_option) },
    { ...base, recon_line: "value", value_type: "total", source: N(valuesTotalIn), migrated: N(m.v_total), failed: N(f.vf_total) },
    // VALUE_SUM: Σ value_numeric fidelity
    { ...base, recon_line: "value_sum", value_type: "numeric", source: N(c.sumValueNumeric), migrated: N(m.sum_numeric), failed: N(f.vf_sum_numeric) },
    // LEAK: unfiltered − matched = orphans (migrated col = relevance-matched values; failed=0)
    { ...base, recon_line: "leak", value_type: "na", source: N(c.valuesNoncalcUnfiltered), migrated: N(valuesTotalIn), failed: "0", note: "variance = p1 values outside relevance (orphans)" },
    // FILL (informational): RAW shells only — variance = empty shells awaiting ENTRY.
    // Raw shells = all shells − calculated shells; filled (v_total) is all raw (calc never fills).
    { ...base, recon_line: "fill", value_type: "na", source: N(Number(m.shells) - Number(m.calc_shells)), migrated: N(m.v_total), failed: "0", note: "raw shells: variance = empty (awaiting entry)" },
    // CALC_SHELL (informational): calculated shells created, awaiting p2 computation (value not migrated).
    { ...base, recon_line: "calc_shell", value_type: "na", source: N(m.calc_shells), migrated: "0", failed: "0", note: "calculated shells — awaiting p2 computation" },
    // EXCLUDED (informational): calculated-value count from the control sheet (not migrated by design)
    { ...base, recon_line: "excluded", value_type: "na", source: N(c.valuesCalculated), migrated: "0", failed: "0", note: "calculated values excluded (computed in p2)" },
  ];

  // idempotent per (load, period): clear then insert
  await db
    .delete(migrationScorecard)
    .where(
      and(
        eq(migrationScorecard.load_id, loadId),
        eq(migrationScorecard.p1_report_period_id, c.p1ReportPeriodId),
      ),
    );
  await db.insert(migrationScorecard).values(lines);
}

/** Anomalies for a load: balance lines whose books don't balance, worst variance first. */
export async function getAnomalies(loadId: number) {
  return (
    (
      await db.execute(sql`
        SELECT p1_report_period_id, report_period_id, period_label, recon_line, value_type,
               source, migrated, failed, variance
        FROM migration_scorecard
        WHERE load_id = ${loadId} AND balance_expected AND NOT is_balanced
        ORDER BY abs(variance) DESC, p1_report_period_id`)
    ).rows ?? []
  );
}

/** Grand-total roll-up across periods, per reconciliation line, for a load. */
export async function getScorecardSummary(loadId: number) {
  return (
    (
      await db.execute(sql`
        SELECT recon_line, value_type,
               sum(source)   AS source,
               sum(migrated) AS migrated,
               sum(failed)   AS failed,
               sum(source) - sum(migrated) - sum(failed) AS variance
        FROM migration_scorecard WHERE load_id = ${loadId}
        GROUP BY recon_line, value_type
        ORDER BY recon_line, value_type`)
    ).rows ?? []
  );
}

/**
 * Migration status reconciliation — MODEL A (preserve p1 CEO-approval end-to-end).
 * Ruled 2026-08-30 (Eugene + #8): p1 "CEO Approved" was a recorded, PERIOD-SCOPED act — approving a
 * period approved its content wholesale — so the shells of an Approved period inherit Approved(5).
 * Truly-empty shells become no_data_reason='not_available' (the CEO approving a period with a blank
 * cell is the implicit acceptance that data was unavailable — NOT a utility assertion), marked
 * loader-derived in comments so evidence views distinguish them. Shells under a NON-Approved period
 * keep their workflow-derived status. Idempotent; run AFTER loadExtract, BEFORE the scorecard so the
 * fill/calc lines reflect the reconciled statuses. Mirrors scripts/sql/2026-08-30-migration-approval-model-a.sql.
 */
export async function reconcileApprovalModelA(): Promise<{ empties: number; lifted: number }> {
  const r1 = await db.execute(sql`
    UPDATE data_entries de
    SET no_data_reason = 'not_available', status_id = ${APPROVED_STATUS},
        comments = (COALESCE(de.comments::jsonb, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'comment', 'Loader-derived (migration Model A): not_available inferred from a CEO-approved period with a blank cell — implicit acceptance that data was unavailable. Not a utility assertion.',
          'commenterId', 'system:migration', 'commenterName', 'Migration (Model A)',
          'commenterRole', 'system', 'date', now(), 'resolved', true)))::json,
        updated_at = now()
    FROM report_periods rp
    WHERE rp.id = de.report_period_id AND rp.status_id = ${APPROVED_STATUS} AND de.status_id < ${APPROVED_STATUS}
      AND de.value_numeric IS NULL AND de.value_boolean IS NULL
      AND de.value_text IS NULL AND de.value_option_id IS NULL AND de.no_data_reason IS NULL`);
  const r2 = await db.execute(sql`
    UPDATE data_entries de SET status_id = ${APPROVED_STATUS}, updated_at = now()
    FROM report_periods rp
    WHERE rp.id = de.report_period_id AND rp.status_id = ${APPROVED_STATUS} AND de.status_id < ${APPROVED_STATUS}`);
  const empties = r1.rowCount ?? 0;
  return { empties, lifted: empties + (r2.rowCount ?? 0) };
}
