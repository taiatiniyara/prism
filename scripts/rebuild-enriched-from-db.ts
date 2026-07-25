/**
 * Rebuilds measures-enriched-final.json + the enriched workbook from the DB (source of truth
 * after the downtime split). Resolves id→name columns for readability.
 */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

async function main() {
  const r = await db.execute(sql`
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
    WHERE m.is_active
    ORDER BY c.name, sc.name, m.name`);
  const rows = (r.rows ?? r) as any[];
  const norm = rows.map((m) => ({
    ...m,
    synonyms: m.synonyms == null ? null : JSON.stringify(m.synonyms),
    alternative_names: m.alternative_names == null ? null : JSON.stringify(m.alternative_names),
    formula_inputs: m.formula_inputs == null ? null : JSON.stringify(m.formula_inputs),
    updated_at: null,
  }));
  writeFileSync("docs/measures-enrichment/measures-enriched-final.json", JSON.stringify(norm, null, 1));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("measure_definitions");
  const H = ["id", "name", "variable_name", "definition", "synonyms", "alternative_names", "definition_status", "category_id", "category", "subcategory_id", "subcategory", "unit_id", "unit", "data_type_id", "data_type", "agg_level_id", "sort_order", "valid_polarity_id", "valid_trend_id", "valid_range_min", "valid_range_max", "is_currency", "is_calculated", "is_active", "formula", "formula_inputs"];
  ws.addRow(H); ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  for (const m of norm) ws.addRow(H.map((h) => (m as any)[h] ?? null));
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  ws.columns.forEach((c, i) => (c.width = ["definition", "synonyms", "alternative_names", "formula", "formula_inputs"].includes(H[i]) ? 40 : Math.max(12, H[i].length + 2)));
  await wb.xlsx.writeFile("C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/measures_definitions - 20260722 - enriched.xlsx");
  console.log("enriched json + workbook rebuilt from DB:", norm.length, "measures");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
