import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { and, eq, inArray, ne } from "drizzle-orm";

const COLS: Record<string, [string, number, number]> = {
  "Power Purchase Costs Customer": ["Electricity Purchases", 1024, 23],
  "Other Duty and Taxes": ["Duty and Taxes - Others", 1023, 21],
  "Distribution Labor Costs": ["Electricity Staff", 1025, 21],
  "Transmission Labor Costs": ["Electricity Staff", 1026, 21],
  "Generation Labor Costs": ["Electricity Staff", 1024, 21],
  "Duty on Fuel and Lube Oil": ["Duty and Taxes - Fuel & Oil", 1024, 21],
  "Other Expenditure": ["Other O&M", 1030, 21],
  "Other Labor Expenditure": ["Other Staff", 1030, 21],
  "Distribution OM Costs": ["Electricity O&M", 1025, 21],
  "Transmission OM Costs": ["Electricity O&M", 1026, 21],
  "Power Purchase Costs IPP": ["Electricity Purchases", 1024, 22],
  "Generation OM Costs": ["Electricity O&M", 1024, 21],
  "Fuel Expenditure": ["Fuel & Oil Expenditure", 1024, 21],
};

const FUEL_MULTIPLIER = [174, 175, 184, 185];
const DATE_FIXES: Record<number, string> = { 215: "2024-12-31", 245: "2025-12-31" };

// Grain used by every existing cost row. Slices on fn=1026 (transmission
// labor / transmission OM) use asset 983; everything else 984.
const DIM_983 = { asset: 983, cat: 30, tech: 40, ct: 690, pm: 720, cb: 1005, div: 1011, gen: 1022 };
const DIM_984 = { asset: 984, cat: 30, tech: 40, ct: 690, pm: 720, cb: 1005, div: 1011, gen: 1022 };

const p1 = JSON.parse(
  readFileSync("../prism-training/factUtilityCosts-p1.json", "utf8"),
) as Record<string, unknown>[];
const p1only = JSON.parse(
  readFileSync("../prism-training/p1only-periods.json", "utf8"),
) as { id: number; utility_id: number; report_type_id: number; report_date: string; request_date: string }[];

async function main() {
  const defs = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions);
  const idByName = new Map(defs.map((d) => [d.name, d.id]));

  const p1RpIds = p1.map((r) => Number(r.ReportPeriodId));
  const allRps = await db
    .select({ id: reportPeriods.id, utility_id: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(inArray(reportPeriods.id, [...new Set([...p1RpIds, ...Object.keys(DATE_FIXES).map(Number), 268])]));
  const utilByRp = new Map(allRps.map((r) => [r.id, r.utility_id]));

  // ---- target cells: every p1 base value that is a finite number ----
  const cells: { rp: number; measure: string; fn: number; prov: number; value: number; dim: typeof DIM_984 }[] = [];
  for (const r of p1) {
    const rp = Number(r.ReportPeriodId);
    for (const [col, [measure, fn, prov]] of Object.entries(COLS)) {
      const v = r[col];
      if (typeof v === "number" && Number.isFinite(v)) {
        const dim = fn === 1026 ? DIM_983 : DIM_984;
        cells.push({ rp, measure, fn, prov, value: v, dim });
      }
    }
  }
  const distinct = new Map<string, typeof cells[number]>();
  for (const c of cells) {
    const m = idByName.get(c.measure);
    if (m == null) throw new Error(`unknown measure '${c.measure}'`);
    distinct.set(`${c.rp}|${m}|${c.fn}|${c.prov}`, c);
  }
  console.log("target cells to ensure in p2 data_entries:", distinct.size);
  for (const c of distinct.values())
    console.log(`  rp=${c.rp} ${c.measure} fn=${c.fn} prov=${c.prov} -> ${c.value}`);

  // ---- snapshot for rollback ----
  const snapIds = [...new Set(p1RpIds)].sort((a, b) => a - b);
  const snapRps = await db
    .select()
    .from(reportPeriods)
    .where(inArray(reportPeriods.id, snapIds));
  const snapEntries = await db
    .select()
    .from(dataEntries)
    .where(inArray(dataEntries.report_period_id, snapIds));
  writeFileSync(
    "sync-factUtilityCosts-backup.json",
    JSON.stringify(
      {
        report_periods: snapRps.map((r) => ({
          id: r.id, utility_id: r.utility_id, report_type_id: r.report_type_id,
          report_date: r.report_date, request_date: r.request_date, status_id: r.status_id,
          bm_opted_in: r.bm_opted_in,
        })),
        data_entries: snapEntries,
      },
      (_, v) => (typeof v === "bigint" ? Number(v) : v),
      2,
    ),
  );

  await db.transaction(async (tx) => {
    for (const [id, date] of Object.entries(DATE_FIXES) as [string, string][]) {
      await tx
        .update(reportPeriods)
        .set({ report_date: new Date(`${date}T00:00:00.000Z`) })
        .where(eq(reportPeriods.id, Number(id)));
    }

    await tx
      .update(reportPeriods)
      .set({ status_id: 5 })
      .where(eq(reportPeriods.id, 268));

    const toInsert = p1only.filter((p) => p.id !== 268);
    await tx.insert(reportPeriods).values(
      toInsert.map((p) => ({
        id: p.id,
        utility_id: p.utility_id,
        report_type_id: p.report_type_id,
        report_date: new Date(`${p.report_date.slice(0, 10)}T00:00:00.000Z`),
        request_date: new Date(p.request_date),
        status_id: 5,
        bm_opted_in: true,
      })),
    );

    await tx
      .update(dataEntries)
      .set({ multiplier: "Thousands" })
      .where(
        and(
          inArray(dataEntries.report_period_id, FUEL_MULTIPLIER),
          eq(dataEntries.measure_def_id, idByName.get("Fuel & Oil Expenditure")!),
          eq(dataEntries.utility_function_id, 1024),
          eq(dataEntries.provider_id, 21),
          eq(dataEntries.is_deleted, false),
        ),
      );

    let inserted = 0;
    let updated = 0;
    let noop = 0;
    for (const c of distinct.values()) {
      const measureId = idByName.get(c.measure)!;
      const existing = await tx
        .select()
        .from(dataEntries)
        .where(
          and(
            eq(dataEntries.report_period_id, c.rp),
            eq(dataEntries.measure_def_id, measureId),
            eq(dataEntries.utility_function_id, c.fn),
            eq(dataEntries.provider_id, c.prov),
            eq(dataEntries.is_deleted, false),
          ),
        );
      const ok = existing.length > 0 && existing.every(
        (e) => Number(e.value_numeric) === c.value && e.no_data_reason == null,
      );
      if (ok) { noop++; continue; }

      if (existing.length === 0) {
        await tx.insert(dataEntries).values({
          report_period_id: c.rp,
          measure_def_id: measureId,
          utility_id: utilByRp.get(c.rp) ?? null,
          utility_function_id: c.fn,
          provider_id: c.prov,
          value_numeric: String(c.value),
          multiplier: "Ones",
          status_id: 5,
          is_relevant: true,
          is_deleted: false,
          asset_class_id: c.dim.asset,
          category_id: c.dim.cat,
          technology_id: c.dim.tech,
          customer_type_id: c.dim.ct,
          payment_mode_id: c.dim.pm,
          consumption_band_id: c.dim.cb,
          division_id: c.dim.div,
          gender_id: c.dim.gen,
        });
        inserted++;
      } else {
        const ids = existing.filter(
          (e) => Number(e.value_numeric) !== c.value || e.no_data_reason != null,
        ).map((e) => e.id);
        if (ids.length > 0) {
          await tx
            .update(dataEntries)
            .set({ value_numeric: String(c.value), no_data_reason: null })
            .where(and(inArray(dataEntries.id, ids), ne(dataEntries.is_deleted, true)));
          updated += ids.length;
        } else { noop++; }
      }
    }

    console.log(`periods inserted: ${toInsert.length} | cells inserted: ${inserted} | rows updated: ${updated} | noop: ${noop}`);
  });

  console.log("sync committed");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });