/**
 * Generates the country-context migration TEMPLATE workbook for the BMO to fill.
 *
 *   node --env-file=.env --import tsx scripts/gen-country-context-template.ts [outPath.xlsx]
 *
 * Sheets:
 *   country_context    — the data sheet (headers only) — FILL THIS ONE
 *   instructions        — how to fill each column, with worked examples
 *   measures (lookup)   — measure_id -> name (the 16 Country Context measures, subgroup 221)
 *   countries (lookup)  — country_id (UN M49) -> name
 */
import ExcelJS from "exceljs";
import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, asc } from "drizzle-orm";

const COUNTRY_CONTEXT_SUBGROUP_ID = 221;

const HEADERS = [
  "mig_id",
  "country_id",
  "measure_id",
  "period_year",
  "value",
  "no_data_reason",
  "source_date",
  "source_doc",
  "source_url",
  "updated_by",
];

async function main() {
  const out =
    process.argv.slice(2).find((a) => !a.startsWith("--")) ??
    "country-context-template.xlsx";

  const measures = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.measures_subgroup_id, COUNTRY_CONTEXT_SUBGROUP_ID))
    .orderBy(asc(measureDefinitions.id));
  const allCountries = await db
    .select({ id: countries.id, name: countries.name })
    .from(countries)
    .orderBy(asc(countries.name));

  const wb = new ExcelJS.Workbook();
  wb.creator = "PRISM #4 (schema)";

  // 1) DATA sheet — headers only, ready to fill
  const ws = wb.addWorksheet("country_context");
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => (col.width = 16));
  ws.getColumn(HEADERS.indexOf("value") + 1).width = 22;
  ws.getColumn(HEADERS.indexOf("source_doc") + 1).width = 28;
  ws.getColumn(HEADERS.indexOf("source_url") + 1).width = 28;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // 2) INSTRUCTIONS sheet
  const wi = wb.addWorksheet("instructions");
  const note = (a: string, b = "") => {
    const r = wi.addRow([a, b]);
    return r;
  };
  wi.addRow(["How to fill this template"]).font = { bold: true, size: 14 };
  wi.addRow([]);
  note(
    "Put one row per country × metric × year on the 'country_context' sheet.",
  );
  note(
    "Use the lookup tabs for the two id columns. Only the first 5 columns are required.",
  );
  wi.addRow([]);
  wi.addRow(["Column", "What to enter"]).font = { bold: true };
  const cols: [string, string][] = [
    ["mig_id", "Your own row reference for tracing (e.g. cc-001). Optional, not stored."],
    ["country_id", "REQUIRED. UN M49 code from the 'countries (lookup)' tab (e.g. Fiji = 242)."],
    ["measure_id", "REQUIRED. The metric id from the 'measures (lookup)' tab (1..16, e.g. Population = 3)."],
    ["period_year", "REQUIRED. The year the figure is FOR, e.g. 2024. One row per year — add a new row for each year of history."],
    ["value", "The figure as text (e.g. 935000 or 12.4). For the two OPTION measures (15 Fuel Supply Access, 16 Fuel Pricing Regulation) put the option_id from the 'options (lookup)' tab, NOT free text. Leave BLANK when the figure isn't available — instead set no_data_reason."],
    ["no_data_reason", "Leave blank normally. If the figure is NOT AVAILABLE for that country/metric/year, leave 'value' blank and put not_available here. A row has EITHER a value OR no_data_reason=not_available, never both."],
    ["source_date", "Optional. Date of the source figure (e.g. 2024-06-30)."],
    ["source_doc", "Optional. Where it came from (e.g. National Statistics Office 2024 report)."],
    ["source_url", "Optional. Link to the source."],
    ["updated_by", "Optional. Who entered it (else left blank)."],
  ];
  for (const [a, b] of cols) wi.addRow([a, b]);
  wi.addRow([]);
  wi.addRow(["Worked examples (copy the shape onto the data sheet):"]).font = {
    bold: true,
  };
  wi.addRow(HEADERS).font = { italic: true };
  const c0 = allCountries.find((c) => c.name === "Fiji")?.id ?? allCountries[0]?.id ?? 242;
  const pop = measures.find((m) => m.name === "Population")?.id ?? 3;
  const gdp = measures.find((m) => m.name === "GDP Per Capita")?.id ?? 9;
  wi.addRow(["cc-001", c0, pop, 2023, "920000", "", "2023-06-30", "Stats Office", "", ""]);
  wi.addRow(["cc-002", c0, pop, 2024, "935000", "", "2024-06-30", "Stats Office", "", ""]);
  wi.addRow(["cc-003", c0, gdp, 2024, "5600", "", "2024-06-30", "Stats Office", "", ""]);
  wi.addRow(["cc-004", c0, gdp, 2022, "", "not_available", "", "", "", ""]);
  wi.getColumn(1).width = 16;
  wi.getColumn(2).width = 60;

  // 3) measures lookup
  const wm = wb.addWorksheet("measures (lookup)");
  wm.addRow(["measure_id", "name"]).font = { bold: true };
  for (const m of measures) wm.addRow([m.id, m.name]);
  wm.getColumn(1).width = 16;
  wm.getColumn(2).width = 34;
  wm.views = [{ state: "frozen", ySplit: 1 }];

  // 4) countries lookup
  const wc = wb.addWorksheet("countries (lookup)");
  wc.addRow(["country_id (UN M49)", "name"]).font = { bold: true };
  for (const c of allCountries) wc.addRow([c.id, c.name]);
  wc.getColumn(1).width = 20;
  wc.getColumn(2).width = 34;
  wc.views = [{ state: "frozen", ySplit: 1 }];

  // 5) options lookup — for option-typed measures (e.g. Fuel Pricing Regulation),
  // the value column takes the OPTION ID listed here (not free text).
  const optionMeasures = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      dataType: managedListItems.name,
    })
    .from(measureDefinitions)
    .leftJoin(
      managedListItems,
      eq(managedListItems.id, measureDefinitions.data_type_id),
    )
    .where(eq(measureDefinitions.measures_subgroup_id, COUNTRY_CONTEXT_SUBGROUP_ID))
    .orderBy(asc(measureDefinitions.id));
  const wo = wb.addWorksheet("options (lookup)");
  wo.addRow(["measure_id", "measure_name", "option_id (put in value)", "option_label"]).font =
    { bold: true };
  for (const m of optionMeasures) {
    if (m.dataType !== "option") continue;
    const [list] = await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, m.name))
      .limit(1);
    const opts = list
      ? await db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(eq(managedListItems.list_id, list.id))
          .orderBy(asc(managedListItems.id))
      : [];
    for (const o of opts) wo.addRow([m.id, m.name, o.id, o.name]);
  }
  wo.getColumn(1).width = 16;
  wo.getColumn(2).width = 24;
  wo.getColumn(3).width = 24;
  wo.getColumn(4).width = 40;
  wo.views = [{ state: "frozen", ySplit: 1 }];

  await wb.xlsx.writeFile(out);
  console.log(
    `wrote ${out} — data sheet (headers only) + instructions + ${measures.length} measures + ${allCountries.length} countries.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
