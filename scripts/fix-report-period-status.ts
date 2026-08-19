import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file: string) {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(resolve(".env"));
loadEnv(resolve(".env.local"));

// Repoint report_periods.status_id from the legacy managed-list 21
// ("Data Workflow Status", items 840-845) to the shared DataEntryStatusId
// enum (1-7). Mirrors scripts/sql/2026-08-18-report-periods-status-repoint.sql.

async function main() {
  const { db } = await import("@/db/connection");
  const { sql } = await import("drizzle-orm");

  const before = await db.execute(
    sql.raw(`SELECT status_id, count(*)::int AS n FROM report_periods GROUP BY status_id ORDER BY status_id`),
  );
  console.log("before:");
  for (const row of before.rows) console.log(`  status_id=${row.status_id} -> ${row.n}`);

  const r = await db.execute(sql.raw(`
    UPDATE report_periods SET status_id = CASE status_id
      WHEN 840 THEN 1
      WHEN 841 THEN 3
      WHEN 842 THEN 2
      WHEN 843 THEN 4
      WHEN 844 THEN 5
      WHEN 845 THEN 5
      ELSE status_id END
    WHERE status_id BETWEEN 840 AND 845
  `));
  console.log("updated rows:", r.rowCount);

  const after = await db.execute(
    sql.raw(`SELECT status_id, count(*)::int AS n FROM report_periods GROUP BY status_id ORDER BY status_id`),
  );
  console.log("after:");
  for (const row of after.rows) console.log(`  status_id=${row.status_id} -> ${row.n}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
