/**
 * (Re)generate the system-computed "Hours in Period" for every report period.
 * Idempotent (upsert). Run this AFTER a bulk reload/reimport — the interactive
 * data-entry paths compute Hours-in-Period per period, but a bulk reload does
 * not, so without this run historical periods have no Hours-in-Period row and
 * every KPI that divides by it breaks. Safe to re-run; run on prod too.
 *
 * Run: node --env-file=.env --import tsx scripts/backfill-hours-in-period.ts
 */
import { backfillHoursInPeriodForAllPeriods } from "@/lib/period-hours";

async function main() {
  console.log("[hours-in-period] backfilling all report periods…");
  const { processed, failed } = await backfillHoursInPeriodForAllPeriods();
  console.log(
    `[hours-in-period] done — processed ${processed}, failed ${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[hours-in-period] backfill run failed:", err);
  process.exit(1);
});
