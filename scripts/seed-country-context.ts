/**
 * Standalone country-context seed loader (Option 2, 2026-08-23).
 *
 * Loads historical national annual figures into the country_context table
 * (country × metric × period_year). NOT part of the data_entries flush-and-reload —
 * country_context is the source of truth for national reference data, read into the
 * Power BI fact shape at query time by getResolvedContextRows (the carry-forward bridge).
 *
 * File format (sheet "country_context", or the first sheet):
 *   mig_id | country_id | measure_def_id | period_year | value | source_date | source_doc | source_url | updated_by
 *   - country_id     = UN M49, must exist in countries
 *   - measure_def_id = a "Country Context" measure (measure_definitions, subgroup 221; ids 1..16)
 *   - period_year    = the reporting YEAR the figure is for (e.g. 2024)
 *   - value          = text, stored as-is
 *   - mig_id         = per-row trace reference (not stored; used in the report only)
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/seed-country-context.ts <file.xlsx> [--dry-run]
 *
 * --dry-run validates (FK-checks + required fields) and reports bad rows WITHOUT writing.
 * A real run upserts idempotently on (country_id, measure_def_id, period_year) — re-running
 * the same file changes nothing. Prints a rows-in / inserted / updated / skipped tally.
 */
import ExcelJS from "exceljs";
import { db } from "@/db/connection";
import { countries, countryContext } from "@/db/schema/country";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, sql } from "drizzle-orm";

const COUNTRY_CONTEXT_SUBGROUP_ID = 221;
const SHEET = "country_context";

type ParsedRow = {
  excelRow: number;
  mig_id: string | null;
  country_id: number | null;
  measure_def_id: number | null;
  period_year: number | null;
  value: string | null;
  no_data_reason: string | null;
  source_date: Date | null;
  source_doc: string | null;
  source_url: string | null;
  updated_by: string | null;
};

function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "text" in v)
    return String((v as { text: unknown }).text).trim() || null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function cellNum(v: unknown): number | null {
  const s = cellStr(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function cellDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = cellStr(v);
  if (s === null) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error(
      "usage: node --env-file=.env --import tsx scripts/seed-country-context.ts <file.xlsx> [--dry-run]",
    );
    process.exit(1);
  }

  const validCountries = new Set(
    (await db.select({ id: countries.id }).from(countries)).map((r) => r.id),
  );
  const validMeasures = new Set(
    (
      await db
        .select({ id: measureDefinitions.id })
        .from(measureDefinitions)
        .where(
          eq(
            measureDefinitions.measures_subgroup_id,
            COUNTRY_CONTEXT_SUBGROUP_ID,
          ),
        )
    ).map((r) => r.id),
  );

  // Option-typed context measures (Fuel Pricing Regulation, Fuel Supply Access):
  // value must be a valid option id from the measure's like-named managed list.
  const contextMeasures = await db
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
    .where(eq(measureDefinitions.measures_subgroup_id, COUNTRY_CONTEXT_SUBGROUP_ID));
  const optionIdsByMeasure = new Map<number, Set<number>>();
  for (const m of contextMeasures) {
    if (m.dataType !== "option") continue;
    const [list] = await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, m.name))
      .limit(1);
    const opts = list
      ? await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(eq(managedListItems.list_id, list.id))
      : [];
    optionIdsByMeasure.set(m.id, new Set(opts.map((o) => o.id)));
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0];
  if (!ws) throw new Error("no worksheet found");

  // map header names -> column numbers (row 1)
  const col: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, c) => {
    const name = cellStr(cell.value);
    if (name) col[name.toLowerCase()] = c;
  });
  const need = ["country_id", "measure_def_id", "period_year", "value"];
  for (const h of need)
    if (!(h in col)) throw new Error(`missing required column "${h}" in header row`);

  const rows: ParsedRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (name: string) =>
      col[name] ? row.getCell(col[name]).value : null;
    // skip fully-blank rows
    if (
      cellStr(get("country_id")) === null &&
      cellStr(get("measure_def_id")) === null &&
      cellStr(get("value")) === null
    )
      return;
    rows.push({
      excelRow: n,
      mig_id: cellStr(get("mig_id")),
      country_id: cellNum(get("country_id")) as number | null,
      measure_def_id: cellNum(get("measure_def_id")) as number | null,
      period_year: cellNum(get("period_year")) as number | null,
      value: cellStr(get("value")),
      no_data_reason: cellStr(get("no_data_reason"))?.toLowerCase() ?? null,
      source_date: cellDate(get("source_date")),
      source_doc: cellStr(get("source_doc")),
      source_url: cellStr(get("source_url")),
      updated_by: cellStr(get("updated_by")),
    });
  });

  // validate
  const good: ParsedRow[] = [];
  const bad: { row: ParsedRow; why: string }[] = [];
  for (const r of rows) {
    const problems: string[] = [];
    if (r.country_id == null || Number.isNaN(r.country_id))
      problems.push("country_id missing/non-numeric");
    else if (!validCountries.has(r.country_id))
      problems.push(`country_id ${r.country_id} not in countries`);
    if (r.measure_def_id == null || Number.isNaN(r.measure_def_id))
      problems.push("measure_def_id missing/non-numeric");
    else if (!validMeasures.has(r.measure_def_id))
      problems.push(
        `measure_def_id ${r.measure_def_id} not a Country Context measure (subgroup ${COUNTRY_CONTEXT_SUBGROUP_ID})`,
      );
    if (r.period_year == null || Number.isNaN(r.period_year))
      problems.push("period_year missing/non-numeric");
    // availability axis: a row carries a value XOR no_data_reason=not_available
    if (r.no_data_reason != null && r.no_data_reason !== "not_available")
      problems.push(
        `no_data_reason "${r.no_data_reason}" invalid — use "not_available" or leave blank`,
      );
    const hasValue = r.value != null;
    const hasReason = r.no_data_reason === "not_available";
    if (hasValue && hasReason)
      problems.push(
        "row has BOTH a value and no_data_reason=not_available — use one or the other",
      );
    else if (!hasValue && !hasReason)
      problems.push("row has neither a value nor no_data_reason=not_available");
    else if (
      hasValue &&
      r.measure_def_id != null &&
      optionIdsByMeasure.has(r.measure_def_id)
    ) {
      const opts = optionIdsByMeasure.get(r.measure_def_id)!;
      const v = Number(r.value);
      if (!Number.isInteger(v) || !opts.has(v))
        problems.push(
          `value "${r.value}" is not a valid option id for measure ${r.measure_def_id} — expected one of: ${[...opts].join(", ")}`,
        );
    }
    if (problems.length) bad.push({ row: r, why: problems.join("; ") });
    else good.push(r);
  }

  console.log(`\ncountry-context seed — ${file}`);
  console.log(`rows read: ${rows.length}   valid: ${good.length}   bad: ${bad.length}`);
  if (bad.length) {
    console.log(`\nBAD ROWS (not loaded — fix and re-run):`);
    for (const b of bad.slice(0, 100))
      console.log(
        `  excel row ${b.row.excelRow} (mig_id ${b.row.mig_id ?? "-"}): ${b.why}`,
      );
    if (bad.length > 100) console.log(`  …and ${bad.length - 100} more`);
  }

  if (dryRun) {
    console.log(`\n--dry-run: no rows written. ${good.length} would upsert.`);
    process.exit(bad.length ? 2 : 0);
  }

  // idempotent upsert
  let inserted = 0,
    updated = 0;
  for (const r of good) {
    const [res] = await db
      .insert(countryContext)
      .values({
        country_id: r.country_id!,
        measure_def_id: r.measure_def_id!,
        period_year: r.period_year!,
        value: r.value,
        no_data_reason: r.no_data_reason as "not_available" | null,
        source_date: r.source_date,
        source_doc: r.source_doc,
        source_url: r.source_url,
        updated_by: r.updated_by,
        updated_date: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          countryContext.country_id,
          countryContext.measure_def_id,
          countryContext.period_year,
        ],
        set: {
          value: r.value,
          no_data_reason: r.no_data_reason as "not_available" | null,
          source_date: r.source_date,
          source_doc: r.source_doc,
          source_url: r.source_url,
          updated_by: r.updated_by,
          updated_date: new Date(),
        },
      })
      .returning({ isInsert: sql<boolean>`(xmax = 0)` });
    if (res?.isInsert) inserted++;
    else updated++;
  }

  console.log(
    `\nLOADED: ${inserted} inserted, ${updated} updated, ${bad.length} skipped (bad). Total upserted: ${inserted + updated}.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
