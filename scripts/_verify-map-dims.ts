/** Verify the p1→p2 map's dimension columns map cleanly onto our 10 canonical dimensions. */
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const FILE = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/p1_to_p2_dl_defs_to_measures_map - 20260723v3.xlsx";

// map column -> our canonical dimension (hypothesis to verify)
const COLMAP: Record<string, string> = {
  energy_provider_id: "provider",
  energy_type_id: "type",
  energy_source_id: "source",
  energy_resource_type_id: "resource_type",
  tariff_type_id: "customer_type", // p1 "tariff_type" == p2 customer_type ?
  payment_mode_id: "payment_mode",
  consumption_band_id: "band",
  division_id: "division",
  gender_id: "gender",
  utility_function_id: "utility_function",
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets[0];
  const hdr = ws.getRow(1).values as any[];
  const idx = (n: string) => hdr.indexOf(n);

  // gather distinct member ids per column (only from mapped rows)
  const cMid = idx("measure_id");
  const distinct: Record<string, Set<number>> = {};
  for (const c of Object.keys(COLMAP)) distinct[c] = new Set();
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const mid = r.getCell(cMid).value;
    if (mid == null || mid === "" || typeof mid === "object") continue; // only mapped rows
    for (const c of Object.keys(COLMAP)) {
      const v = r.getCell(idx(c)).value;
      if (v != null && v !== "" && !isNaN(Number(v))) distinct[c].add(Number(v));
    }
  }

  // for each column, look up the DB list(s) those member ids belong to
  for (const [col, dim] of Object.entries(COLMAP)) {
    const ids = [...distinct[col]];
    if (!ids.length) { console.log(`${col} -> ${dim}: (no values)`); continue; }
    const idList = ids.join(",");
    const rows = ((await db.execute(sql.raw(`
      SELECT l.name AS list, count(*)::int n
      FROM managed_list_items i JOIN managed_lists l ON l.id=i.list_id
      WHERE i.id IN (${idList}) GROUP BY l.name ORDER BY n DESC`))).rows ?? []) as any[];
    const missing = ((await db.execute(sql.raw(`SELECT x FROM (VALUES ${ids.map((v) => `(${v})`).join(",")}) AS t(x) WHERE x NOT IN (SELECT id FROM managed_list_items)`))).rows ?? []) as any[];
    console.log(`\n${col} -> ${dim}: ${ids.length} distinct ids`);
    rows.forEach((r) => console.log(`   list "${r.list}": ${r.n} ids`));
    if (missing.length) console.log(`   ⚠ ${missing.length} ids NOT in managed_list_items: ${missing.map((m) => m.id).slice(0, 10)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
