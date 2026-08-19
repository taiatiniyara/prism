/**
 * Regenerates the scope + applicability review workbooks DIRECTLY from the current JSON
 * (measure-dimension-scope-final.json, measure-dimension-applicability.json). Does NOT
 * re-derive from rules — so it always matches the DB / latest edits.
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const DIR = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions";
const DIMS = ["provider", "type", "source", "resource_type", "customer_type", "payment_mode", "band", "division", "gender", "utility_function"];

async function main() {
  const scope = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", "utf8"));
  const appl = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-applicability.json", "utf8"));
  const measures = JSON.parse(readFileSync("docs/measures-enrichment/measures-enriched-final.json", "utf8"));
  const mem = await db.execute(sql`SELECT id, name FROM managed_list_items`);
  const memName = new Map(((mem.rows ?? mem) as any[]).map((r) => [r.id, r.name]));

  // scope matrix
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("scope_matrix");
  s.addRow(["id", "name", "category", "subcategory", ...DIMS]);
  s.getRow(1).font = { bold: true }; s.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  const modeByMeasure = new Map<number, Record<string, string>>();
  for (const r of scope) { if (!modeByMeasure.has(r.measure_id)) modeByMeasure.set(r.measure_id, {}); modeByMeasure.get(r.measure_id)![r.dimension] = r.expansion_mode; }
  for (const m of measures) {
    const modes = modeByMeasure.get(m.id) ?? {};
    const row = s.addRow([m.id, m.name, m.category, m.subcategory, ...DIMS.map((d) => modes[d] ?? "not_applicable")]);
    DIMS.forEach((d, i) => { const c = row.getCell(5 + i); const v = modes[d]; if (v === "by_context") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; else if (v === "all_members") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } }; });
  }
  s.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  s.columns.forEach((c, i) => (c.width = i === 1 ? 32 : 14));
  const s2 = wb.addWorksheet("scope_rows");
  s2.addRow(["measure_id", "measure_name", "dimension", "expansion_mode"]); s2.getRow(1).font = { bold: true };
  for (const r of scope) s2.addRow([r.measure_id, r.measure_name, r.dimension, r.expansion_mode]);
  await wb.xlsx.writeFile(`${DIR}/measure_dimension_scope - final.xlsx`);

  // applicability
  const wb2 = new ExcelJS.Workbook();
  const a = wb2.addWorksheet("applicability");
  a.addRow(["measure_id", "measure_name", "dimension", "member_id", "member", "basis", "review?"]); a.getRow(1).font = { bold: true };
  for (const r of appl) { const row = a.addRow([r.measure_id, r.measure_name, r.dimension, r.member_id, memName.get(r.member_id) ?? "?", r.basis, r.review ? "REVIEW" : ""]); if (r.review) row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; }
  a.columns.forEach((c, i) => (c.width = [12, 34, 16, 11, 18, 34, 10][i]));
  a.views = [{ state: "frozen", ySplit: 1 }];
  await wb2.xlsx.writeFile(`${DIR}/measure_dimension_applicability - draft.xlsx`);

  console.log("workbooks regenerated from current JSON — scope rows:", scope.length, "| applicability rows:", appl.length);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
