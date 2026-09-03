import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";

/**
 * Canonical benchmarking-participation predicate — the ONE choke point
 * (per-period-participation-spec §3/§4, #8's single-helper requirement).
 *
 * A `(utility, period)` is benchmarked — its data is collected and its KPIs /
 * calculated measures are computed — iff:
 *   organisations.is_utility = true  AND  report_periods.bm_opted_in = true
 *
 * Notes:
 * - It intentionally does NOT gate on `organisations.bm_participates`. That
 *   org-level flag is an ACCESS/eligibility gate (#10's tiered-access model) and
 *   is being retired for the compute path; the per-period `bm_opted_in` is the
 *   source of truth for whether a period is benchmarked. Once every compute
 *   caller gates on this predicate and is live, #2 drops `bm_participates`.
 * - When #10's two-axis model lands, `is_utility` becomes
 *   `relationship = 'utility'` — change it HERE, in one place, and every gate
 *   (KPI recompute, calculated-measure period enumeration, hours generation,
 *   shell generation) follows.
 *
 * Every query below imports the SAME `reportPeriods` / `organisations` schema
 * objects, so `benchmarkingParticipantCondition()` is portable across callers
 * (Drizzle conditions reference columns by table object, not by alias).
 */
export function benchmarkingParticipantCondition() {
  return and(
    eq(organisations.is_utility, true),
    eq(reportPeriods.bm_opted_in, true),
  );
}

/**
 * The report periods currently opted into benchmarking (the compute universe).
 * Callers that enumerate periods to compute should use this instead of
 * hand-rolling the predicate.
 */
export async function listBenchmarkingPeriodIds(): Promise<number[]> {
  const rows = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .innerJoin(organisations, eq(organisations.id, reportPeriods.utility_id))
    .where(benchmarkingParticipantCondition())
    .orderBy(asc(reportPeriods.id));
  return rows.map((r) => r.id);
}

/**
 * Single `(utility, period)` gate — for per-row checks (e.g. a data-entry or
 * hours-generation path deciding whether one period is benchmarked).
 */
export async function isBenchmarkingParticipant(
  utilityId: number,
  reportPeriodId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .innerJoin(organisations, eq(organisations.id, reportPeriods.utility_id))
    .where(
      and(
        eq(reportPeriods.id, reportPeriodId),
        eq(organisations.id, utilityId),
        benchmarkingParticipantCondition(),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
