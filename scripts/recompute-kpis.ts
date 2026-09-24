/**
 * Recompute a set of KPIs across every benchmarking-opted-in report period.
 * Use after any formula_binding_dimension / formula_inputs correction so
 * `kpi.actual_value` reflects the fix (it does not update itself).
 *
 *   node --env-file=.env --import tsx scripts/recompute-kpis.ts 33 62 63 78 79 80 82 89
 */
import { recomputeKpiNow } from "@/app/data-entry/kpi-worker/recompute";

const kpiDefIds = process.argv
  .slice(2)
  .map((a) => Number(a))
  .filter((n) => Number.isInteger(n) && n > 0);

async function main() {
  if (kpiDefIds.length === 0) {
    console.error("Usage: recompute-kpis.ts <kpiDefId...>");
    process.exit(1);
  }

  console.log(`Recomputing KPIs [${kpiDefIds.join(", ")}] across all opted-in periods...`);
  const result = await recomputeKpiNow({ kpiDefIds });

  console.log(`processed=${result.processed} failed=${result.failed} notApplicable=${result.notApplicable}`);
  if (result.failed > 0) {
    console.log("Failures:");
    for (const row of result.byPeriod) {
      if (row.status === "failed") {
        console.log(`  period ${row.reportPeriodId} kpi ${row.kpiDefId}: ${row.reason}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });