/**
 * Migration CLI — flush-and-reload loader (docs/schema-redesign-medallion.md §4.3).
 *
 * Parses the customer's p1→p2 extract (already resolved to p2 ids) and the p1 control-totals
 * sheet, runs the two-pass loader (shell then value) recording every rejection in the ledger,
 * then reconciles the per-period scorecard and prints anomalies.
 *
 *   Dry-run (parse + validate only, NO DB):
 *     node --import tsx scripts/migrate.ts <extract.xlsx> [control-totals.xlsx] --dry-run
 *   Load (needs DATABASE_URL):
 *     node --env-file=.env --import tsx scripts/migrate.ts <extract.xlsx> <control-totals.xlsx> --label="EFL FY2024"
 *
 * Flags: --dry-run  parse/validate only, no writes · --label=TEXT  load label
 *        --limit=N   parse at most N extract rows (smoke test)
 * Exit code is non-zero if there are parse errors or scorecard anomalies (pipeline-friendly).
 */
import {
  parseControlTotalsWorkbook,
  parseExtractWorkbook,
  type ParseError,
} from "../lib/migration/parse";
import type { ExtractRow } from "../lib/migration/types";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const FLAGS = new Set(process.argv.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]));
const positionals = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const DRY_RUN = FLAGS.has("--dry-run");
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const LABEL = arg("label");
const [extractPath, controlPath] = positionals;

function printParseErrors(label: string, errors: ParseError[]): void {
  if (errors.length === 0) return;
  console.log(`\n⚑ ${errors.length} parse error(s) in ${label} (first 25):`);
  for (const e of errors.slice(0, 25))
    console.log(`    row ${e.row} [${e.field}] ${e.reason}${e.raw != null ? ` (got: ${JSON.stringify(e.raw)})` : ""}`);
}

function perPeriodBreakdown(rows: ExtractRow[]): void {
  const by = new Map<number, { total: number; filled: number }>();
  for (const r of rows) {
    const b = by.get(r.reportPeriodId) ?? { total: 0, filled: 0 };
    b.total += 1;
    if (r.value != null && r.valueType) b.filled += 1;
    by.set(r.reportPeriodId, b);
  }
  console.log("\nExtract by report_period (period: shells, filled, empty):");
  for (const [pid, b] of [...by.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`    ${pid}: ${b.total} shells, ${b.filled} filled, ${b.total - b.filled} empty`);
}

async function main() {
  if (!extractPath) {
    console.error("usage: migrate.ts <extract.xlsx> [control-totals.xlsx] [--dry-run] [--label=..] [--limit=N]");
    process.exit(2);
  }

  console.log(`Parsing extract: ${extractPath}${LIMIT ? ` (limit ${LIMIT})` : ""}`);
  const extract = await parseExtractWorkbook(extractPath, { limit: LIMIT });
  console.log(`  → ${extract.rows.length} rows parsed, ${extract.errors.length} parse error(s)`);
  printParseErrors("extract", extract.errors);
  perPeriodBreakdown(extract.rows);

  const control = controlPath
    ? await parseControlTotalsWorkbook(controlPath)
    : { rows: [], errors: [] };
  if (controlPath) {
    console.log(`\nParsing control totals: ${controlPath}`);
    console.log(`  → ${control.rows.length} period(s), ${control.errors.length} parse error(s)`);
    printParseErrors("control totals", control.errors);
  } else {
    console.log("\n(no control-totals file given — scorecard reconciliation will be skipped)");
  }

  const parseErrorCount = extract.errors.length + control.errors.length;

  if (DRY_RUN) {
    console.log(`\nDRY-RUN — no data written. ${parseErrorCount} parse error(s).`);
    console.log("Re-run without --dry-run (and with DATABASE_URL) to load.");
    process.exit(parseErrorCount > 0 ? 1 : 0);
  }

  if (extract.rows.length === 0) {
    console.error("\nNothing to load (0 valid extract rows). Fix parse errors first.");
    process.exit(1);
  }

  // DB-touching work — imported lazily so --dry-run needs no DATABASE_URL.
  const { startLoad, finishLoad, reconcilePeriod, getAnomalies, getScorecardSummary } =
    await import("../lib/migration/loads");
  const { loadExtract } = await import("../lib/migration/load");

  const loadId = await startLoad({ label: LABEL, sourceSystem: "p1_extract" });
  console.log(`\nLoad #${loadId} started. Loading ${extract.rows.length} rows…`);

  const result = await loadExtract(loadId, extract.rows);
  console.log(
    `\nLoad result: ${result.shellsCreated} shells (${result.calculatedShells} calculated), ` +
      `${result.shellsFailed} shell failures | ${result.valuesFilled} values filled, ` +
      `${result.valuesFailed} value failures | ${result.skipped} skipped`,
  );

  if (control.rows.length > 0) {
    for (const c of control.rows) await reconcilePeriod(loadId, c);
    const summary = await getScorecardSummary(loadId);
    console.log("\nScorecard (per reconciliation line, summed across periods):");
    for (const s of summary as Record<string, unknown>[])
      console.log(`    ${s.recon_line}/${s.value_type}: source=${s.source} migrated=${s.migrated} failed=${s.failed} variance=${s.variance}`);

    const anomalies = await getAnomalies(loadId);
    if (anomalies.length) {
      console.log(`\n⚑ ${anomalies.length} scorecard anomaly(ies) — books don't balance:`);
      for (const a of anomalies as Record<string, unknown>[])
        console.log(`    period ${a.p1_report_period_id} ${a.recon_line}/${a.value_type}: source=${a.source} migrated=${a.migrated} failed=${a.failed} variance=${a.variance}`);
    } else {
      console.log("\n✓ Scorecard balanced — no anomalies.");
    }
    await finishLoad(loadId, "completed"); // anomalies reported above; run itself completed
    process.exit(anomalies.length || parseErrorCount ? 1 : 0);
  }

  await finishLoad(loadId, "completed");
  console.log("\n(loaded without scorecard — pass a control-totals file to reconcile)");
  process.exit(parseErrorCount ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
