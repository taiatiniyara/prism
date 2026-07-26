/**
 * Generates the migration control-totals template: one row per report_period, the
 * source-of-truth counts/sums produced in p1 and reconciled against by the p2 loader.
 * Two sheets: control_totals (headers + example) and legend (definitions + identities).
 */
import ExcelJS from "exceljs";

const COLS: { key: string; header: string; note: string; width: number }[] = [
  { key: "p1_report_period_id", header: "p1_report_period_id", note: "p1 report_periods.id — join key", width: 20 },
  { key: "utility", header: "utility", note: "utility code/name (readability)", width: 12 },
  { key: "period_label", header: "period_label", note: "e.g. FY2024, 2024-01", width: 14 },
  { key: "period_type", header: "period_type", note: "Annual / Monthly / Quarterly", width: 13 },
  { key: "period_start", header: "period_start", note: "period start date", width: 13 },
  { key: "period_end", header: "period_end", note: "period end date", width: 13 },
  { key: "relevance_records", header: "relevance_records", note: "SHELL: count of p1 relevance records = expected shells", width: 18 },
  { key: "values_numeric", header: "values_numeric", note: "VALUE: matched non-calc values typed numeric", width: 16 },
  { key: "values_boolean", header: "values_boolean", note: "VALUE: matched non-calc values typed boolean", width: 16 },
  { key: "values_text", header: "values_text", note: "VALUE: matched non-calc values typed free-text", width: 14 },
  { key: "values_option", header: "values_option", note: "VALUE: matched non-calc values typed option (managed-list)", width: 15 },
  { key: "sum_value_numeric", header: "sum_value_numeric", note: "FIDELITY: arithmetic sum of the numeric values", width: 20 },
  { key: "values_noncalc_unfiltered", header: "values_noncalc_unfiltered", note: "LEAK: ALL non-calc values, ignoring relevance", width: 26 },
  { key: "values_calculated", header: "values_calculated", note: "INFO: calculated values excluded (RAW-ONLY)", width: 18 },
];

const EXAMPLE: Record<string, string | number> = {
  p1_report_period_id: 101, utility: "EFL", period_label: "FY2024", period_type: "Annual",
  period_start: "2024-01-01", period_end: "2024-12-31", relevance_records: 1240,
  values_numeric: 1050, values_boolean: 30, values_text: 0, values_option: 40,
  sum_value_numeric: 4812300.5, values_noncalc_unfiltered: 1125, values_calculated: 95,
};

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("control_totals");
  ws.addRow(COLS.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  const ex = ws.addRow(COLS.map((c) => EXAMPLE[c.key] ?? ""));
  ex.font = { italic: true, color: { argb: "FF808080" } };
  ex.getCell(1).note = "EXAMPLE ROW — delete before submitting.";
  COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];

  const lg = wb.addWorksheet("legend");
  lg.addRow(["column", "definition"]);
  lg.getRow(1).font = { bold: true };
  lg.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  COLS.forEach((c) => lg.addRow([c.header, c.note]));
  lg.addRow([]);
  lg.addRow(["— identities the loader checks, per report_period —", ""]);
  [
    ["Shell", "relevance_records = shells_created + shells_failed"],
    ["Value", "(numeric+boolean+text+option) = values_migrated + values_failed"],
    ["Fidelity", "sum_value_numeric = Σ value_numeric migrated"],
    ["Leak", "values_noncalc_unfiltered − values_total = orphans (flag if > 0)"],
    ["Fill", "empty_shells = relevance_records − values_total"],
  ].forEach((r) => lg.addRow(r));
  lg.getColumn(1).width = 28;
  lg.getColumn(2).width = 70;

  const out = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/migration_control_totals - template.xlsx";
  await wb.xlsx.writeFile(out);
  console.log("template written:", out);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
