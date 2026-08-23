/**
 * Generates the country-context migration TEMPLATE workbook for the BMO to fill.
 *
 *   node --env-file=.env --import tsx scripts/gen-country-context-template.ts [outPath.xlsx]
 *
 * Sheets:
 *   country_context   — the data sheet (headers + 2 example rows) matching the seed loader
 *   measures (lookup)  — measure_def_id -> name (the 16 Country Context measures, subgroup 221)
 *   countries (lookup) — country_id (UN M49) -> name
 */
import ExcelJS from "exceljs";
import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { eq, asc } from "drizzle-orm";

const COUNTRY_CONTEXT_SUBGROUP_ID = 221;

const HEADERS = [
  "mig_id",
  "country_id",
  "measure_def_id",
  "period_year",
  "value",
  "source_date",
  "source_doc",
  "source_url",
  "updated_by",
];

async function main() {
  const out = process.argv.slice(2).find((a) => !a.startsWith("--")) ??
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

  const ws = wb.addWorksheet("country_context");
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };
  // two example rows (Population for the first country, two years) — delete before loading
  const c0 = allCountries[0]?.id ?? 583;
  const pop = measures.find((m) => m.name === "Population")?.id ?? 3;
  ws.addRow(["ex-1", c0, pop, 2023, "920000", "2023-06-30", "National Statistics Office", "", ""]);
  ws.addRow(["ex-2", c0, pop, 2024, "935000", "2024-06-30", "National Statistics Office", "", ""]);
  ws.columns.forEach((col) => (col.width = 16));

  const wm = wb.addWorksheet("measures (lookup)");
  wm.addRow(["measure_def_id", "name"]);
  wm.getRow(1).font = { bold: true };
  for (const m of measures) wm.addRow([m.id, m.name]);
  wm.getColumn(1).width = 16;
  wm.getColumn(2).width = 34;

  const wc = wb.addWorksheet("countries (lookup)");
  wc.addRow(["country_id (UN M49)", "name"]);
  wc.getRow(1).font = { bold: true };
  for (const c of allCountries) wc.addRow([c.id, c.name]);
  wc.getColumn(1).width = 20;
  wc.getColumn(2).width = 34;

  await wb.xlsx.writeFile(out);
  console.log(
    `wrote ${out} — ${measures.length} measures, ${allCountries.length} countries. Delete the ex-* rows before loading.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
