/**
 * Generates the migration EXTRACT template — the columns the customer's p1→p2
 * extract must carry (the input to scripts/migrate.ts). Headers match
 * EXTRACT_COLUMNS in lib/migration/parse.ts and the ExtractRow contract in
 * lib/migration/types.ts. Two sheets: `extract` (headers + example rows) and
 * `legend` (per-column meaning, required?, and All-member defaults).
 *
 * Run: node --import tsx scripts/gen-extract-template.ts [--out=PATH]
 */
import ExcelJS from "exceljs";

const arg = (n: string) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : undefined;
};
const OUT = arg("out") ?? "./p2_migration_extract_template.xlsx";

// col, required?, All-member default (dims), meaning
const COLS: { key: string; req: string; all: string; note: string }[] = [
  { key: "report_period_id", req: "REQUIRED", all: "", note: "report_periods.id — unchanged p1↔p2" },
  { key: "measure_id", req: "REQUIRED", all: "", note: "measure_definitions.id (the measure)" },
  { key: "energy_provider_id", req: "REQUIRED", all: "20", note: "dim: Energy Provider member id (All=20)" },
  { key: "energy_type_id", req: "REQUIRED", all: "30", note: "dim: Energy Type member id (All=30)" },
  { key: "energy_source_id", req: "REQUIRED", all: "40", note: "dim: Energy Source member id (All GEN=40)" },
  { key: "energy_resource_type_id", req: "REQUIRED", all: "983", note: "dim: Energy Resource Type member id (All=983)" },
  { key: "customer_type_id", req: "REQUIRED", all: "690", note: "dim: Customer Type member id (All=690)" },
  { key: "payment_mode_id", req: "REQUIRED", all: "720", note: "dim: Payment Mode member id (All=720)" },
  { key: "consumption_band_id", req: "REQUIRED", all: "1005", note: "dim: Consumption Band member id (All=1005)" },
  { key: "division_id", req: "REQUIRED", all: "1011", note: "dim: Division member id (All=1011)" },
  { key: "gender_id", req: "REQUIRED", all: "1022", note: "dim: Gender member id (All=1022)" },
  { key: "utility_function_id", req: "REQUIRED", all: "1023", note: "dim: Utility Function member id (All=1023)" },
  { key: "utility_id", req: "optional", all: "", note: "grain: organisations.id (null at finer/other grains)" },
  { key: "service_area_id", req: "optional", all: "", note: "grain: service_areas.id (null at higher levels)" },
  { key: "power_station_id", req: "optional", all: "", note: "grain: power_stations.id" },
  { key: "energy_resource_id", req: "optional", all: "", note: "grain: energy_resources.id (equipment)" },
  { key: "country_id", req: "optional", all: "", note: "grain: countries.id" },
  { key: "value_type", req: "if value", all: "", note: "one of: numeric | boolean | text | option" },
  { key: "value", req: "optional", all: "", note: "the value (option → managed_list_items id). Present=filled shell, blank=empty shell" },
  { key: "status_id", req: "optional", all: "", note: "else derived: filled→Entered(3), empty→Requested(1)" },
];

const headers = COLS.map((c) => c.key);

// Example rows (address uses All-member dims; grain varies)
const EX_FILLED: Record<string, string | number> = {
  report_period_id: 175, measure_id: 1501,
  energy_provider_id: 20, energy_type_id: 30, energy_source_id: 40, energy_resource_type_id: 983,
  customer_type_id: 690, payment_mode_id: 720, consumption_band_id: 1005, division_id: 1011,
  gender_id: 1022, utility_function_id: 1023,
  service_area_id: 5, value_type: "numeric", value: 123456, status_id: 3,
};
const EX_EMPTY: Record<string, string | number> = {
  report_period_id: 175, measure_id: 200,
  energy_provider_id: 20, energy_type_id: 30, energy_source_id: 40, energy_resource_type_id: 983,
  customer_type_id: 690, payment_mode_id: 720, consumption_band_id: 1005, division_id: 1011,
  gender_id: 1022, utility_function_id: 1023, service_area_id: 5,
};
const EX_SLICED: Record<string, string | number> = {
  report_period_id: 175, measure_id: 300,
  energy_provider_id: 21, energy_type_id: 32, energy_source_id: 54, energy_resource_type_id: 984,
  customer_type_id: 690, payment_mode_id: 720, consumption_band_id: 1005, division_id: 1011,
  gender_id: 1022, utility_function_id: 1024, energy_resource_id: 88,
  value_type: "numeric", value: 42.5, status_id: 3,
};

async function main() {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("extract");
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  for (const ex of [EX_FILLED, EX_EMPTY, EX_SLICED]) {
    const r = ws.addRow(headers.map((h) => ex[h] ?? ""));
    r.font = { italic: true, color: { argb: "FF808080" } };
  }
  ws.getRow(2).getCell(1).note =
    "EXAMPLE ROWS (grey) — delete before submitting. Row1: filled numeric (All dims). Row2: empty shell (no value). Row3: sliced dims (Utility/Renewable/Solar, Generation).";
  headers.forEach((_, i) => (ws.getColumn(i + 1).width = 22));
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

  const lg = wb.addWorksheet("legend");
  lg.addRow(["column", "required", "All-member default", "meaning"]);
  lg.getRow(1).font = { bold: true };
  lg.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  for (const c of COLS) lg.addRow([c.key, c.req, c.all, c.note]);
  lg.addRow([]);
  lg.addRow(["— rules —", "", "", ""]);
  [
    ["All 10 dimensions REQUIRED", "every row carries all ten dimension member ids; use the All-member id where not sliced (defaults above)."],
    ["Pre-resolved to p2 ids", "measure_id, dimension ids, and grain ids are already p2-valid (resolved during extraction) — the loader does no id mapping."],
    ["One file", "relevance + values together: a row with a value = filled shell; a row without = empty (awaiting-entry) shell."],
    ["Calculated measures", "pass the SHELL only (no value) — p2 computes their value."],
    ["Grain", "exactly one physical grain per row; higher levels leave finer grain ids blank."],
  ].forEach((r) => lg.addRow(r));
  lg.getColumn(1).width = 26; lg.getColumn(2).width = 12; lg.getColumn(3).width = 18; lg.getColumn(4).width = 90;

  await wb.xlsx.writeFile(OUT);
  console.log("extract template written:", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
