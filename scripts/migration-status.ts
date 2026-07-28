/**
 * Migration iteration report — variance by load (iteration), so you can watch reconciliation
 * converge and know when everything is CLEAN.
 *
 * All numbers are AUTO-COMPUTED (nothing hand-entered): the scorecard's `source` came from your
 * loaded control-totals file, `migrated` from data_entries, `failed` from the rejection ledger, and
 * `variance = source - migrated - failed`. This report just rolls them up per load_id.
 *
 *   node --env-file=.env --import tsx scripts/migration-status.ts            # all iterations
 *   node --env-file=.env --import tsx scripts/migration-status.ts --detail=3 # per-line for load 3
 */
import { db } from "../db/connection";
import { sql } from "drizzle-orm";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const rows = (r: { rows?: unknown[] }) => (r.rows ?? []) as Record<string, unknown>[];

async function main() {
  const loads = rows(
    await db.execute(sql`
      SELECT id, label, status, rows_in, rows_migrated, rows_failed, started_at, finished_at
      FROM migration_loads ORDER BY id`),
  );
  if (loads.length === 0) {
    console.log("No loads yet — run scripts/migrate.ts <extract> <control-totals> --label=…");
    return;
  }

  const detail = arg("detail");
  if (detail) {
    const lid = Number(detail);
    console.log(`=== load #${lid} — scorecard by period × line (variance = source − migrated − failed) ===`);
    const lines = rows(
      await db.execute(sql`
        SELECT p1_report_period_id AS period, recon_line, value_type, source, migrated, failed, variance,
               balance_expected, is_balanced
        FROM migration_scorecard WHERE load_id = ${lid}
        ORDER BY p1_report_period_id, recon_line, value_type`),
    );
    if (!lines.length) { console.log("  (no scorecard rows — was a control-totals file loaded for this run?)"); return; }
    for (const l of lines) {
      const flag = l.balance_expected && !l.is_balanced ? "  ⚠ ANOMALY" : "";
      console.log(`  p${l.period} ${l.recon_line}/${l.value_type}: source=${l.source} migrated=${l.migrated} failed=${l.failed} variance=${l.variance}${flag}`);
    }
    return;
  }

  console.log("=== migration iterations (oldest → newest) ===\n");
  for (const l of loads) {
    const s = rows(
      await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE balance_expected AND NOT is_balanced)::int AS anomalies,
          COALESCE(sum(abs(variance)) FILTER (WHERE balance_expected AND NOT is_balanced), 0) AS var_total
        FROM migration_scorecard WHERE load_id = ${l.id}`),
    )[0];
    const rej = rows(await db.execute(sql`SELECT count(*)::int AS c FROM migration_rejections WHERE load_id = ${l.id}`))[0];
    const anomalies = Number(s?.anomalies ?? 0);
    const varTotal = Number(s?.var_total ?? 0);
    const clean = anomalies === 0 && varTotal === 0 && Number(l.rows_failed ?? 0) === 0;
    const when = (l.finished_at ?? l.started_at) as Date | null;
    console.log(
      `#${l.id} ${l.label ? `"${l.label}" ` : ""}[${l.status}] ${when ? new Date(when).toISOString().slice(0, 16).replace("T", " ") : ""}`);
    console.log(
      `   rows: in=${l.rows_in ?? "?"} migrated=${l.rows_migrated ?? "?"} failed=${l.rows_failed ?? "?"} | ` +
      `scorecard: ${anomalies} anomaly line(s), Σ|variance|=${varTotal} | rejections=${rej?.c ?? 0}` +
      `${clean ? "   ✓ CLEAN" : ""}`);
  }
  console.log("\n(use --detail=<load_id> to see a run's per-period, per-line variance)");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
