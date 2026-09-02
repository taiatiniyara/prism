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
 *        --new-orgs=FILE  STEP 0: onboard NEW organisations/service_areas/report_periods from an
 *                    Excel workbook BEFORE the load (FK parents for the facts). Omit when the run has
 *                    no new utilities. Idempotent (existing ids skipped). See
 *                    docs/migration-new-organisation-format.md.
 *        --no-flush  append to existing data_entries (default is flush-and-reload: truncate first,
 *                    so you can iterate the migration cleanly — each run is a fresh replace)
 * Exit code is non-zero if there are parse errors or scorecard anomalies (pipeline-friendly).
 */
import {
  parseControlTotalsWorkbook,
  parseExtractWorkbook,
  type ParseError,
} from "../lib/migration/parse";
import {
  parseNewOrganisationsWorkbook,
  type NewOrgFile,
} from "../lib/migration/onboard-parse";
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
const NEW_ORGS = arg("new-orgs"); // optional Excel workbook of NEW orgs/service_areas/report_periods
const [extractPath, controlPath] = positionals;

function printParseErrors(label: string, errors: ParseError[]): void {
  if (errors.length === 0) return;
  console.log(`\n⚑ ${errors.length} parse error(s) in ${label} (first 25):`);
  for (const e of errors.slice(0, 25))
    console.log(`    row ${e.row} [${e.field}] ${e.reason}${e.raw != null ? ` (got: ${JSON.stringify(e.raw)})` : ""}`);
}

function perPeriodBreakdown(rows: ExtractRow[]): void {
  const by = new Map<number, { total: number; filled: number; noData: number }>();
  for (const r of rows) {
    const b = by.get(r.reportPeriodId) ?? { total: 0, filled: 0, noData: 0 };
    b.total += 1;
    if (r.value != null && r.valueType) b.filled += 1;
    else if (r.noDataReason) b.noData += 1;
    by.set(r.reportPeriodId, b);
  }
  console.log("\nExtract by report_period (period: shells, filled, no-data, empty):");
  for (const [pid, b] of [...by.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`    ${pid}: ${b.total} shells, ${b.filled} filled, ${b.noData} no-data, ${b.total - b.filled - b.noData} empty`);
}

async function main() {
  if (!extractPath) {
    console.error("usage: migrate.ts <extract.xlsx> [control-totals.xlsx] [--dry-run] [--label=..] [--limit=N] [--new-orgs=new-organisations.xlsx]");
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

  // STEP 0 (optional) — NEW organisations / service_areas / report_periods. Parsed here so its
  // structural errors join the dry-run gate; the actual idempotent insert (with semantic/DB
  // validation) runs below, BEFORE the data_entries flush, so a bad file never truncates anything.
  let newOrg: { data: NewOrgFile; errors: ParseError[] } | null = null;
  if (NEW_ORGS) {
    console.log(`\nParsing new-organisations file: ${NEW_ORGS}`);
    newOrg = await parseNewOrganisationsWorkbook(NEW_ORGS);
    console.log(
      `  → ${newOrg.data.organisations.length} org(s), ${newOrg.data.serviceAreas.length} service area(s), ` +
        `${newOrg.data.reportPeriods.length} report period(s); ${newOrg.errors.length} parse error(s)`,
    );
    printParseErrors("new-organisations", newOrg.errors);
  } else {
    console.log("\n(no --new-orgs file — no new organisations to onboard; will go straight to data-entries)");
  }

  const parseErrorCount =
    extract.errors.length + control.errors.length + (newOrg?.errors.length ?? 0);

  if (DRY_RUN) {
    console.log(`\nDRY-RUN — no data written. ${parseErrorCount} parse error(s).`);
    if (newOrg)
      console.log(
        "  (new-organisations: structural parse only in dry-run — semantic/DB validation runs at load.)",
      );
    console.log("Re-run without --dry-run (and with DATABASE_URL) to load.");
    process.exit(parseErrorCount > 0 ? 1 : 0);
  }

  if (extract.rows.length === 0) {
    console.error("\nNothing to load (0 valid extract rows). Fix parse errors first.");
    process.exit(1);
  }

  // DB-touching work — imported lazily so --dry-run needs no DATABASE_URL.
  const { startLoad, finishLoad, reconcilePeriod, getAnomalies, getScorecardSummary, reconcileApprovalModelA } =
    await import("../lib/migration/loads");
  const { loadExtract } = await import("../lib/migration/load");
  const { db } = await import("../db/connection");
  const { sql } = await import("drizzle-orm");

  // STEP 0 — onboard NEW organisations / service_areas / report_periods (FK parents for the load).
  // Runs BEFORE the flush: if the file fails validation we abort here, so data_entries is never
  // truncated with missing parents. Idempotent — existing ids are skipped, so re-runs are safe.
  if (newOrg) {
    const { onboardNewOrganisations } = await import("../lib/migration/onboard");
    const ob = await onboardNewOrganisations(newOrg.data);
    if (ob.errors.length) {
      console.error(`\n⚑ New-organisation onboarding ABORTED — ${ob.errors.length} validation error(s) (nothing written):`);
      for (const e of ob.errors.slice(0, 50)) console.error(`    ${e}`);
      process.exit(1);
    }
    console.log(
      `\nStep 0 — new organisations onboarded: ${ob.orgsCreated} org(s) created (${ob.orgsSkipped} already existed), ` +
        `${ob.saCreated} service area(s) (${ob.saSkipped} existed), ${ob.periodsCreated} report period(s) (${ob.periodsSkipped} existed), ` +
        `${ob.saLinksAdded} SA↔period link(s) added.`,
    );
  }

  // FLUSH-AND-RELOAD (default): empty data_entries so every iteration is a clean replace and rows
  // can't collide on the unique address. Pass --no-flush to append to existing rows.
  if (!FLAGS.has("--no-flush")) {
    console.log("\nFlush-and-reload: truncating data_entries (CASCADE — also clears data_entry_logs)…");
    await db.execute(sql`TRUNCATE data_entries CASCADE`);
  } else {
    console.log("\n--no-flush: appending to existing data_entries (rows may collide on the unique address).");
  }

  const loadId = await startLoad({ label: LABEL, sourceSystem: "p1_extract" });
  console.log(`\nLoad #${loadId} started. Loading ${extract.rows.length} rows…`);

  const result = await loadExtract(loadId, extract.rows);
  console.log(
    `\nLoad result: ${result.shellsCreated} shells (${result.calculatedShells} calculated), ` +
      `${result.shellsFailed} shell failures | ${result.valuesFilled} values filled, ` +
      `${result.noDataAnswers} no-data answers | ` +
      `${result.valuesFailed} value/no-data failures | ${result.skipped} skipped`,
  );

  // MODEL A (Eugene + #8, 2026-08-30): preserve p1 CEO-approval end-to-end. Shells of an Approved
  // period inherit Approved(5); truly-empty shells → not_available (loader-derived). Runs before the
  // scorecard so fill/calc lines reflect the reconciled statuses.
  const approvalA = await reconcileApprovalModelA();
  console.log(
    `\nModel-A approval reconciliation: ${approvalA.lifted} shells lifted to Approved ` +
      `(${approvalA.empties} empty → not_available) under CEO-approved periods.`,
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
