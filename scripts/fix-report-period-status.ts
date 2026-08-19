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

const WRONG_STATUS_ID = 5;
const CORRECT_STATUS_ID = 844;

async function main() {
  const { db } = await import("@/db/connection");
  const { reportPeriods } = await import("@/db/schema/reportPeriods");
  const { eq, sql } = await import("drizzle-orm");

  const wrong = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(eq(reportPeriods.status_id, WRONG_STATUS_ID));

  console.log(
    `Found ${wrong.length} report periods with status_id=${WRONG_STATUS_ID} (stale value).`,
  );

  if (wrong.length === 0) {
    console.log("Nothing to fix.");
    process.exit(0);
  }

  await db
    .update(reportPeriods)
    .set({ status_id: CORRECT_STATUS_ID })
    .where(eq(reportPeriods.status_id, WRONG_STATUS_ID));

  const after = await db
    .select({ status_id: reportPeriods.status_id, cnt: sql<number>`count(*)` })
    .from(reportPeriods)
    .groupBy(reportPeriods.status_id);

  console.log("Updated. Status distribution now:");
  for (const row of after) {
    console.log(`  status_id=${row.status_id} -> ${row.cnt} periods`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
