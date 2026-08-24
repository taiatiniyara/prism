/**
 * Relevance / shell verification runner.
 *
 *   node --env-file=.env --import tsx scripts/verify-relevance.ts
 *
 * Runs the committed invariant checks + accounting (lib/relevance/verify) against the
 * database and prints a report. Exits 1 if any error-severity invariant is violated, 0
 * otherwise — so it can gate a migration/cutover or run in CI against a target DB.
 */
import { runAllChecks, type Finding } from "@/lib/relevance/verify";
import { runGenerativeChecks } from "@/lib/relevance/expected";

const icon = (f: Finding) =>
  f.ok ? "✓" : f.severity === "error" ? "✗" : "!";

function printFinding(f: Finding) {
  console.log(
    `  ${icon(f)} [${f.severity}] ${f.check} — ${f.ok ? "pass" : `${f.count}`} ${f.ok ? "" : "issue(s)"}`,
  );
  if (!f.ok) {
    console.log(`      ${f.summary}`);
    for (const r of f.rows.slice(0, 20)) console.log("      · " + JSON.stringify(r));
    if (f.rows.length > 20) console.log(`      … and ${f.rows.length - 20} more`);
  }
}

async function main() {
  const { findings, accounting, completeness, ok } = await runAllChecks();
  const generative = await runGenerativeChecks();

  console.log("\n══ Relevance / shell verification ══\n");

  console.log("INVARIANTS (verify — what exists is valid)");
  for (const f of findings) printFinding(f);

  console.log("\nGENERATIVE (expected − actual — what's missing / over-applied)");
  for (const f of generative) printFinding(f);

  console.log("\nSHELL ACCOUNTING — two denominators (never mixed)");
  for (const b of accounting) {
    console.log(
      `  ${String(b.bucket).padEnd(34)} shells ${String(b.shells).padStart(6)}  filled ${String(b.filled).padStart(6)}  no_data ${String(b.no_data).padStart(6)}  empty ${String(b.empty).padStart(5)}`,
    );
  }

  // utility completeness summary (performance denominator)
  const withPct = completeness.map((c) => ({
    utility: c.utility,
    period: c.report_date,
    requested: Number(c.requested),
    answered: Number(c.answered),
    pct: Number(c.requested) ? Math.round((Number(c.answered) / Number(c.requested)) * 100) : 0,
  }));
  const avg = withPct.length
    ? Math.round(withPct.reduce((a, c) => a + c.pct, 0) / withPct.length)
    : 0;
  console.log(
    `\nUTILITY COMPLETENESS (answered ÷ human-answerable requested) — ${withPct.length} utility-periods, avg ${avg}%`,
  );
  const worst = [...withPct].sort((a, b) => a.pct - b.pct).slice(0, 5);
  for (const w of worst)
    console.log(`  ${String(w.utility).padEnd(38)} ${w.period}  ${w.answered}/${w.requested}  ${w.pct}%`);

  const allOk = ok && generative.every((f) => f.severity !== "error" || f.ok);
  console.log(`\n${allOk ? "✓ PASS — no invariant or expected-set violations" : "✗ FAIL — violation(s) above"}\n`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
