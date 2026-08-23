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
// Dimension headers use the PHYSICALISED names (post-#68 rename) — they must match
// EXTRACT_COLUMNS in lib/migration/parse.ts and the data_entries schema columns.
const COLS: { key: string; req: string; all: string; note: string }[] = [
  { key: "mig_id", req: "optional", all: "", note: "MIGRATION-ONLY: your source row's unique id. Echoed into the rejection ledger (source_ref) so every error traces to the exact row. NOT stored in p2. Aliases: unique_id, uid, source_row_id, row_id, ref." },
  { key: "report_period_id", req: "REQUIRED", all: "", note: "report_periods.id — unchanged p1↔p2" },
  { key: "measure_id", req: "REQUIRED", all: "", note: "measure_definitions.id (the measure) → maps to measure_def_id" },
  { key: "provider_id", req: "REQUIRED", all: "20", note: "dim: Provider member id (All=20)" },
  { key: "category_id", req: "REQUIRED", all: "30", note: "dim: Category member id (All=30)" },
  { key: "technology_id", req: "REQUIRED", all: "40", note: "dim: Technology member id (All GEN=40)" },
  { key: "asset_class_id", req: "REQUIRED", all: "983", note: "dim: Asset member id (All=983)" },
  { key: "customer_type_id", req: "REQUIRED", all: "690", note: "dim: Customer Type member id (All=690)" },
  { key: "payment_mode_id", req: "REQUIRED", all: "720", note: "dim: Payment Mode member id (All=720)" },
  { key: "consumption_band_id", req: "REQUIRED", all: "1005", note: "dim: Consumption Band member id (All=1005)" },
  { key: "division_id", req: "REQUIRED", all: "1011", note: "dim: Division member id (All=1011)" },
  { key: "gender_id", req: "REQUIRED", all: "1022", note: "dim: Gender member id (All=1022)" },
  { key: "utility_function_id", req: "REQUIRED", all: "1023", note: "dim: Utility Function member id (All=1023)" },
  { key: "utility_id", req: "optional", all: "", note: "grain: organisations.id (null at finer/other grains)" },
  { key: "service_area_id", req: "optional", all: "", note: "grain: service_areas.id (null at higher levels)" },
  { key: "power_station_id", req: "optional", all: "", note: "grain: power_stations.id" },
  { key: "unit_id", req: "optional", all: "", note: "grain: units.id (equipment/unit — formerly energy_resources)" },
  { key: "country_id", req: "optional", all: "", note: "grain: countries.id" },
  { key: "value_type", req: "if value", all: "", note: "one of: numeric | boolean | text | option" },
  { key: "value", req: "optional", all: "", note: "the value (option → managed_list_items id). Present=filled shell, blank=empty shell" },
  { key: "no_data_reason", req: "optional", all: "", note: "answer-availability (no value, but why): 'not_available' (in scope + applies, couldn't obtain) or 'asserted_not_applicable' (utility asserts doesn't apply — OPTIONAL measures only, rejected on mandatory). MUTUALLY EXCLUSIVE with value. p1 'Not Available' → not_available." },
  { key: "status_id", req: "optional", all: "", note: "else derived: filled/no-data→Entered(3), empty→Pending(2). p1 not_available convention → 5 (Approved). (Requested(1) retired — Pending is the single starting state.)" },
  { key: "updated_by_id", req: "optional", all: "", note: "provenance: original data-entry person → updated_by_id (must be a p2 user.id; unresolved → nulled + logged)" },
  { key: "updated_at", req: "optional", all: "", note: "provenance: original entry date/time → updated_at (preserved, not overwritten). Aliases: update_date, entered_at" },
  { key: "comment", req: "optional", all: "", note: "provenance: the entry person's note → wrapped into data_entries.comments. Aliases: note, comments" },
];

const headers = COLS.map((c) => c.key);

// Example rows (address uses All-member dims; grain varies)
const EX_FILLED: Record<string, string | number> = {
  report_period_id: 175, measure_id: 1501,
  provider_id: 20, category_id: 30, technology_id: 40, asset_class_id: 983,
  customer_type_id: 690, payment_mode_id: 720, consumption_band_id: 1005, division_id: 1011,
  gender_id: 1022, utility_function_id: 1023,
  service_area_id: 5, value_type: "numeric", value: 123456, status_id: 3,
};
const EX_EMPTY: Record<string, string | number> = {
  report_period_id: 175, measure_id: 200,
  provider_id: 20, category_id: 30, technology_id: 40, asset_class_id: 983,
  customer_type_id: 690, payment_mode_id: 720, consumption_band_id: 1005, division_id: 1011,
  gender_id: 1022, utility_function_id: 1023, service_area_id: 5,
};
const EX_SLICED: Record<string, string | number> = {
  report_period_id: 175, measure_id: 300,
  provider_id: 21, category_id: 32, technology_id: 54, asset_class_id: 984,
  customer_type_id: 690, payment_mode_id: 720, consumption_band_id: 1005, division_id: 1011,
  gender_id: 1022, utility_function_id: 1024, unit_id: 88,
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
