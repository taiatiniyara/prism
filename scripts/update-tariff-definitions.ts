import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const rows = JSON.parse(readFileSync("docs/measures-enrichment/measures-enriched-final.json", "utf8"));

const DEFS: Record<string, string> = {
  tariff_block_limit_kwh:
    "The cumulative consumption threshold, in kWh measured FROM ZERO, at which one tariff rate ends and the next begins. For a tariff with N rates there are N-1 block limits: Block Limit 1 is the cumulative kWh up to which Rate 1 applies, Block Limit 2 is where Rate 2 gives way to Rate 3, and so on; the final rate runs indefinitely with no upper limit. Enter the CUMULATIVE figure from zero (the upper bound of the block) — never the width of the block, and never an amount relative to the previous block's limit. Block limits must increase strictly (Limit 1 < Limit 2 < ...). At entry the lower bound is shown auto-filled (0 for the first block, the previous limit thereafter) so only the cumulative upper bound is keyed.",
  tariff_rate_per_kwh_within_the_block_currency:
    "The per-kWh charge applying to consumption within a given tariff block, entered in the utility's local currency and EXCLUDING VAT/GST (tax is captured separately as the Tariff VAT or GST Rate measure). Rate 1 applies from zero up to Block Limit 1, Rate 2 from Block Limit 1 to Block Limit 2, and the final rate indefinitely. Enter the TAX-EXCLUSIVE rate; the customer-facing tax-inclusive figure is derived as rate x (1 + tax rate) and shown at entry for verification against the published rate.",
  tariff_fixed_monthly_charge_currency:
    "The fixed monthly service/standing charge levied on a customer regardless of consumption, entered in the utility's local currency and EXCLUDING VAT/GST (tax captured separately). Enter the TAX-EXCLUSIVE amount; the tax-inclusive figure customers pay is derived as charge x (1 + tax rate) and shown at entry for verification.",
};

let updated = 0;
for (const r of rows) {
  if (DEFS[r.variable_name]) { r.definition = DEFS[r.variable_name]; updated++; console.log("updated:", r.name); }
}
writeFileSync("docs/measures-enrichment/measures-enriched-final.json", JSON.stringify(rows, null, 1));

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("measure_definitions");
  const H = ["id", "name", "variable_name", "definition", "synonyms", "alternative_names", "definition_status", "category_id", "category", "subcategory_id", "subcategory", "unit_id", "unit", "data_type_id", "data_type", "agg_level_id", "sort_order", "valid_polarity_id", "valid_trend_id", "valid_range_min", "valid_range_max", "is_currency", "is_calculated", "is_active", "formula", "formula_inputs", "updated_at"];
  ws.addRow(H); ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  for (const r of rows) ws.addRow(H.map((h) => r[h] ?? null));
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  ws.columns.forEach((c, i) => (c.width = ["definition", "synonyms", "alternative_names", "formula", "formula_inputs"].includes(H[i]) ? 40 : Math.max(12, H[i].length + 2)));
  await wb.xlsx.writeFile("C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/measures_definitions - 20260722 - enriched.xlsx");
  console.log(`\n${updated} definitions updated; enriched workbook regenerated`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
