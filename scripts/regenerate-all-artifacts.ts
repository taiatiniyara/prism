/**
 * Regenerate ALL migration artifacts straight from the DB (source of truth):
 *   docs/measures-enrichment/  measures-enriched-final.json · measure-dimension-scope-final.json ·
 *                              measure-dimension-applicability.json
 *   OneDrive/Decisions/        measures_definitions - <..> - enriched.xlsx ·
 *                              measure_dimension_scope - final.xlsx ·
 *                              measure_dimension_applicability - draft.xlsx
 * Reads from the DB only — NO re-derivation from rules. Includes all measures with is_active shown.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const JSON_DIR = "docs/measures-enrichment";
const DIR = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions";
const DIMS = ["provider", "type", "source", "resource_type", "customer_type", "payment_mode", "band", "division", "gender", "utility_function"];

async function main() {
  // ---- measures (all, with resolved names) ----
  const mrows = (((await db.execute(sql`
    SELECT m.id, m.name, m.variable_name, m.definition, m.synonyms, m.alternative_names, m.definition_status,
           m.category_id, c.name AS category, m.subcategory_id, sc.name AS subcategory,
           m.unit_id, u.name AS unit, m.data_type_id, dt.name AS data_type, m.agg_level_id, m.sort_order,
           m.valid_polarity_id, m.valid_trend_id, m.valid_range_min, m.valid_range_max,
           m.is_currency, m.is_calculated, m.is_active, m.formula, m.formula_inputs
    FROM measure_definitions m
    LEFT JOIN managed_list_items c ON c.id=m.category_id
    LEFT JOIN managed_list_items sc ON sc.id=m.subcategory_id
    LEFT JOIN managed_list_items u ON u.id=m.unit_id
    LEFT JOIN managed_list_items dt ON dt.id=m.data_type_id
    ORDER BY c.name, sc.name, m.name`)).rows ?? [])) as any[];
  const measures = mrows.map((m) => ({
    ...m,
    synonyms: m.synonyms == null ? null : JSON.stringify(m.synonyms),
    alternative_names: m.alternative_names == null ? null : JSON.stringify(m.alternative_names),
    formula_inputs: m.formula_inputs == null ? null : JSON.stringify(m.formula_inputs),
  }));
  writeFileSync(`${JSON_DIR}/measures-enriched-final.json`, JSON.stringify(measures, null, 1));

  // ---- scope (from DB) ----
  const scope = ((await db.execute(sql`
    SELECT s.measure_id, m.name AS measure_name, s.dimension, s.expansion_mode
    FROM measure_dimension_scope s JOIN measure_definitions m ON m.id=s.measure_id
    ORDER BY s.measure_id, s.dimension`)).rows ?? []) as any[];
  writeFileSync(`${JSON_DIR}/measure-dimension-scope-final.json`, JSON.stringify(scope, null, 1));

  // ---- applicability (from DB; preserve basis/review where key still matches) ----
  const applRows = ((await db.execute(sql`
    SELECT a.measure_id, m.name AS measure_name, a.dimension, a.member_id, i.name AS member
    FROM measure_dimension_applicability a JOIN measure_definitions m ON m.id=a.measure_id
    JOIN managed_list_items i ON i.id=a.member_id
    ORDER BY a.measure_id, a.dimension, a.member_id`)).rows ?? []) as any[];
  let prevMap = new Map<string, any>();
  const pPath = `${JSON_DIR}/measure-dimension-applicability.json`;
  if (existsSync(pPath)) prevMap = new Map(JSON.parse(readFileSync(pPath, "utf8")).map((r: any) => [`${r.measure_id}|${r.dimension}|${r.member_id}`, r]));
  const appl = applRows.map((r) => {
    const p = prevMap.get(`${r.measure_id}|${r.dimension}|${r.member_id}`);
    return { measure_id: r.measure_id, measure_name: r.measure_name, dimension: r.dimension, member_id: r.member_id, member: r.member, basis: p?.basis ?? "", review: p?.review ?? false };
  });
  writeFileSync(pPath, JSON.stringify(appl, null, 1));

  // ---- workbooks ----
  const HEAD = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCE6F1" } };

  // enriched
  const wbM = new ExcelJS.Workbook();
  const ws = wbM.addWorksheet("measure_definitions");
  const H = ["id", "name", "variable_name", "definition", "synonyms", "alternative_names", "definition_status", "category_id", "category", "subcategory_id", "subcategory", "unit_id", "unit", "data_type_id", "data_type", "agg_level_id", "sort_order", "valid_polarity_id", "valid_trend_id", "valid_range_min", "valid_range_max", "is_currency", "is_calculated", "is_active", "formula", "formula_inputs"];
  ws.addRow(H); ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = HEAD;
  for (const m of measures) { const row = ws.addRow(H.map((h) => (m as any)[h] ?? null)); if (!m.is_active) row.font = { color: { argb: "FF999999" } }; }
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  ws.columns.forEach((c, i) => (c.width = ["definition", "synonyms", "alternative_names", "formula", "formula_inputs"].includes(H[i]) ? 40 : Math.max(12, H[i].length + 2)));
  await wbM.xlsx.writeFile(`${DIR}/measures_definitions - 20260723 - enriched.xlsx`);

  // scope
  const wbS = new ExcelJS.Workbook();
  const s = wbS.addWorksheet("scope_matrix");
  s.addRow(["id", "name", "active", "category", "subcategory", ...DIMS]); s.getRow(1).font = { bold: true }; s.getRow(1).fill = HEAD;
  const modeBy = new Map<number, Record<string, string>>();
  for (const r of scope) { if (!modeBy.has(r.measure_id)) modeBy.set(r.measure_id, {}); modeBy.get(r.measure_id)![r.dimension] = r.expansion_mode; }
  for (const m of measures) {
    const modes = modeBy.get(m.id) ?? {};
    const row = s.addRow([m.id, m.name, m.is_active ? "" : "inactive", m.category, m.subcategory, ...DIMS.map((d) => modes[d] ?? "not_applicable")]);
    DIMS.forEach((d, i) => { const cell = row.getCell(6 + i); const v = modes[d]; if (v === "by_context") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; else if (v === "all_members") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } }; });
  }
  s.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }]; s.columns.forEach((c, i) => (c.width = i === 1 ? 32 : 14));
  const s2 = wbS.addWorksheet("scope_rows");
  s2.addRow(["measure_id", "measure_name", "dimension", "expansion_mode"]); s2.getRow(1).font = { bold: true };
  for (const r of scope) s2.addRow([r.measure_id, r.measure_name, r.dimension, r.expansion_mode]);
  await wbS.xlsx.writeFile(`${DIR}/measure_dimension_scope - final.xlsx`);

  // applicability
  const wbA = new ExcelJS.Workbook();
  const a = wbA.addWorksheet("applicability");
  a.addRow(["measure_id", "measure_name", "dimension", "member_id", "member", "basis", "review?"]); a.getRow(1).font = { bold: true }; a.getRow(1).fill = HEAD;
  for (const r of appl) { const row = a.addRow([r.measure_id, r.measure_name, r.dimension, r.member_id, r.member, r.basis, r.review ? "REVIEW" : ""]); if (r.review) row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; }
  a.columns.forEach((c, i) => (c.width = [12, 34, 16, 11, 22, 34, 10][i])); a.views = [{ state: "frozen", ySplit: 1 }];
  await wbA.xlsx.writeFile(`${DIR}/measure_dimension_applicability - draft.xlsx`);

  const active = measures.filter((m) => m.is_active).length;
  console.log(`artifacts regenerated from DB — measures: ${measures.length} (${active} active) | scope rows: ${scope.length} | applicability rows: ${appl.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
