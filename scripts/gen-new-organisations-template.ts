/**
 * Generates the new-organisation onboarding template (migration STEP 0): a workbook with three
 * sheets — organisations / service_areas / report_periods — linked by EXPLICIT p2 ids, consumed by
 * scripts/migrate.ts --new-orgs=<file>. See docs/migration-new-organisation-format.md.
 *
 *   node --import tsx scripts/gen-new-organisations-template.ts [out.xlsx]
 */
import ExcelJS from "exceljs";

type Col = { header: string; note: string; width: number };

const ORG_COLS: Col[] = [
  { header: "id", note: "REQUIRED. Explicit p2 organisations.id (the extract's utility_id references this).", width: 8 },
  { header: "name", note: "REQUIRED. Organisation name.", width: 26 },
  { header: "acronym", note: "Short code (optional).", width: 10 },
  { header: "country_id", note: "REQUIRED. countries.id.", width: 11 },
  { header: "is_utility", note: "TRUE/FALSE (default TRUE). A utility MUST declare fye_month + fye_day.", width: 11 },
  { header: "fye_month", note: "REQUIRED for a utility. Financial-year-end month 1..12 (the onboarding FYE declaration).", width: 10 },
  { header: "fye_day", note: "REQUIRED for a utility. Financial-year-end day 1..31.", width: 9 },
  { header: "is_mth_report_relevant", note: "TRUE/FALSE (default FALSE). Utility submits monthly reports.", width: 20 },
  { header: "utility_type_id", note: "managed_list_items.id (default 440).", width: 15 },
  { header: "utility_size_id", note: "managed_list_items.id (optional).", width: 15 },
  { header: "operating_basis_id", note: "managed_list_items.id (optional).", width: 17 },
  { header: "entity_type_id", note: "managed_list_items.id (optional).", width: 14 },
  { header: "accounting_standard_id", note: "managed_list_items.id (optional).", width: 20 },
  { header: "electricity_regulation_id", note: "managed_list_items.id (optional).", width: 22 },
  { header: "powerquality_standard_id", note: "managed_list_items.id (optional).", width: 22 },
  { header: "ppa_membership_type_id", note: "managed_list_items.id (optional).", width: 20 },
  { header: "services_provided_id", note: "managed_list_items.id (optional).", width: 18 },
  { header: "is_active", note: "TRUE/FALSE (default TRUE).", width: 9 },
  { header: "updated_date", note: "Free text (optional).", width: 14 },
];

const ORG_EXAMPLE: Record<string, string | number | boolean> = {
  id: 60, name: "New Utility Co", acronym: "NUC", country_id: 12, is_utility: true,
  fye_month: 6, fye_day: 30, is_mth_report_relevant: false, utility_type_id: 440, is_active: true,
};

const SA_COLS: Col[] = [
  { header: "id", note: "REQUIRED. Explicit p2 service_areas.id (the extract's service_area_id references this).", width: 8 },
  { header: "utility_id", note: "REQUIRED. organisations.id — must appear in the organisations sheet or already exist in p2.", width: 11 },
  { header: "name", note: "Service-area name (default 'SA <id>').", width: 18 },
  { header: "strata_id", note: "managed_list_items.id (default 1).", width: 10 },
  { header: "provides_electricity", note: "TRUE/FALSE (default TRUE).", width: 18 },
  { header: "provides_water", note: "TRUE/FALSE (default FALSE).", width: 15 },
  { header: "provides_sanitation", note: "TRUE/FALSE (default FALSE).", width: 18 },
  { header: "operations_only", note: "TRUE/FALSE (default FALSE).", width: 15 },
  { header: "is_virtual", note: "TRUE/FALSE (default FALSE).", width: 11 },
  { header: "is_active", note: "TRUE/FALSE (default TRUE).", width: 9 },
];

const SA_EXAMPLE: Record<string, string | number | boolean> = {
  id: 200, utility_id: 60, name: "Main", strata_id: 1, provides_electricity: true,
  provides_water: false, provides_sanitation: false, operations_only: false, is_virtual: false, is_active: true,
};

const RP_COLS: Col[] = [
  { header: "id", note: "REQUIRED. Explicit p2 report_periods.id (the extract's report_period_id references this).", width: 8 },
  { header: "utility_id", note: "REQUIRED. organisations.id (in the organisations sheet or already in p2).", width: 11 },
  { header: "report_type_id", note: "REQUIRED. managed_list_items.id of the report type (e.g. the id for 'Financial Year').", width: 15 },
  { header: "fy_end_year", note: "Financial-Year periods: the FY-end YEAR. report_date is computed = (year, org.fye_month, org.fye_day).", width: 12 },
  { header: "report_date", note: "Non-FY periods only: explicit period-end date (used when fy_end_year is blank).", width: 14 },
  { header: "status", note: "Pending | Entered | Reviewed | Approved (default Pending). Approved = CEO-approved (publishable; Model-A lifts its shells).", width: 12 },
  { header: "request_date", note: "Optional; defaults to report_date.", width: 14 },
  { header: "lean_mode", note: "TRUE/FALSE (default FALSE).", width: 10 },
  { header: "who_id", note: "roles.id (optional).", width: 9 },
];

const RP_EXAMPLES: Record<string, string | number | boolean>[] = [
  { id: 900, utility_id: 60, report_type_id: 0, fy_end_year: 2023, status: "Approved", lean_mode: false },
  { id: 901, utility_id: 60, report_type_id: 0, fy_end_year: 2024, status: "Pending", lean_mode: false },
];

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  cols: Col[],
  examples: Record<string, string | number | boolean>[],
) {
  const ws = wb.addWorksheet(name);
  ws.addRow(cols.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  ws.getRow(1).eachCell((cell, i) => {
    cell.note = cols[i - 1].note;
  });
  for (const ex of examples) {
    const row = ws.addRow(cols.map((c) => (c.header in ex ? ex[c.header] : "")));
    row.font = { italic: true, color: { argb: "FF808080" } };
    row.getCell(1).note = "EXAMPLE ROW — delete before submitting.";
  }
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  return ws;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, "organisations", ORG_COLS, [ORG_EXAMPLE]);
  addSheet(wb, "service_areas", SA_COLS, [SA_EXAMPLE]);
  addSheet(wb, "report_periods", RP_COLS, RP_EXAMPLES);

  const lg = wb.addWorksheet("legend");
  lg.addRow(["column", "definition"]);
  lg.getRow(1).font = { bold: true };
  lg.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  const section = (title: string) => {
    const r = lg.addRow([title, ""]);
    r.font = { bold: true };
  };
  section("organisations");
  ORG_COLS.forEach((c) => lg.addRow([c.header, c.note]));
  section("service_areas");
  SA_COLS.forEach((c) => lg.addRow([c.header, c.note]));
  section("report_periods");
  RP_COLS.forEach((c) => lg.addRow([c.header, c.note]));
  lg.addRow([]);
  section("how it runs");
  [
    ["step", "First step of a migration: node --import tsx scripts/migrate.ts <extract.xlsx> <control.xlsx> --new-orgs=<this file>"],
    ["no new orgs", "Omit --new-orgs entirely — the run reports 'no new organisations' and goes straight to data-entries."],
    ["explicit ids", "All ids are explicit p2 ids so the fact extract can reference them deterministically."],
    ["idempotent", "Re-running skips any id that already exists — safe to re-run; composes with flush-and-reload (which only truncates data_entries)."],
    ["FY report_date", "For a Financial-Year period, report_date is DERIVED from fy_end_year + the org's fye_month/fye_day — always aligned to the canonical FYE."],
    ["status → gate", "Approved periods publish to Power BI/benchmarking and Model-A lifts their shells to Approved; use Pending for open, unapproved periods."],
  ].forEach((r) => lg.addRow(r));
  lg.getColumn(1).width = 26;
  lg.getColumn(2).width = 110;

  const out = process.argv[2] ?? "new-organisations-template.xlsx";
  await wb.xlsx.writeFile(out);
  console.log("template written:", out);
  console.log("NOTE: set report_periods.report_type_id to the managed_list_items id of your report type (e.g. 'Financial Year') — the example uses 0 as a placeholder.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
