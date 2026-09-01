import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const measures = JSON.parse(readFileSync("docs/measures-enrichment/measures-enriched-final.json", "utf8"));
const scope = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", "utf8"));

// member id maps
const SRC = { Diesel: 46, "Heavy Fuel": 48, "Natural Gas": 53, Coal: 45, Biomass: 44, Solar: 54, Wind: 55, Battery: 43, "Hydrogen Cells": 52, "Hydro Pumped Storage": 51 };
const RT = { Generator: 984, "Energy Storage": 985 };
const FN = { Generation: 1024, Transmission: 1026, Distribution: 1025 };
const PROV = { Utility: 21, IPP: 22, Customer: 23 };

// which (measure by subcategory/name) restricts which dimension to which members + basis
function applicability(m: any): { dimension: string; members: number[]; basis: string; review: boolean }[] {
  const out: { dimension: string; members: number[]; basis: string; review: boolean }[] = [];
  const sub = m.subcategory as string, name = String(m.name);
  const has = (dim: string) => scope.some((s: any) => s.measure_id === m.id && s.dimension === dim && s.expansion_mode === "by_context");

  // resource_type: generation vs storage
  if (has("resource_type")) {
    if (["Electricity Stored", "Electricity Discharged"].includes(sub) || /charging/i.test(name)) out.push({ dimension: "resource_type", members: [RT["Energy Storage"]], basis: "storage measure → Energy Storage", review: false });
    else out.push({ dimension: "resource_type", members: [RT.Generator], basis: "generation measure → Generator", review: false });
  }
  // source restrictions
  if (has("source")) {
    if (/^fuel oil$/i.test(name)) out.push({ dimension: "source", members: [SRC.Diesel, SRC["Heavy Fuel"]], basis: "fuel oil = liquid fuels", review: false });
    else if (/lubrication oil/i.test(name)) out.push({ dimension: "source", members: [SRC.Diesel, SRC["Heavy Fuel"], SRC["Natural Gas"]], basis: "lube oil = combustion engines", review: true });
    else if (/fuel & oil expenditure/i.test(name)) out.push({ dimension: "source", members: [SRC.Diesel, SRC["Heavy Fuel"]], basis: "user-confirmed Diesel+Heavy Fuel", review: false });
    else if (sub === "Solar Environment") out.push({ dimension: "source", members: [SRC.Solar], basis: "solar-only environmental measure", review: false });
    else if (["Electricity Stored", "Electricity Discharged"].includes(sub) || /charging/i.test(name)) out.push({ dimension: "source", members: [SRC.Battery, SRC["Hydrogen Cells"], SRC["Hydro Pumped Storage"]], basis: "storage sources", review: true });
    // else: generation measures → all sources (no rows) — REVIEW whether to exclude pure-storage sources
  }
  // utility_function restrictions
  if (has("utility_function")) {
    if (["Network", "Transformers"].includes(sub)) out.push({ dimension: "utility_function", members: [FN.Transmission, FN.Distribution], basis: "network asset → T&D only", review: false });
    else if (/electricity sent to grid/i.test(name)) out.push({ dimension: "utility_function", members: [FN.Transmission], basis: "sent to grid at transmission", review: true });
    else if (sub === "Cost Breakdown" || /^employees$|fte employees|hours worked/i.test(name) || sub === "FTE Employees" || sub === "Staff Utilization") out.push({ dimension: "utility_function", members: [FN.Generation, FN.Transmission, FN.Distribution], basis: "function-split cost/labour", review: false });
    else if (sub === "Downtime") out.push({ dimension: "utility_function", members: [FN.Generation, FN.Transmission, FN.Distribution], basis: "downtime across functions", review: false });
    else out.push({ dimension: "utility_function", members: [FN.Generation], basis: "generation-function measure", review: true });
  }
  // provider restrictions
  if (has("provider")) {
    if (/purchase|purchased/i.test(name)) out.push({ dimension: "provider", members: [PROV.IPP, PROV.Customer], basis: "purchases from non-utility", review: false });
    // else generation: all providers (Utility/IPP/Customer) — no rows
  }
  return out;
}

async function main() {
  const rows: any[] = [];
  for (const m of measures) for (const a of applicability(m)) for (const mem of a.members) rows.push({ measure_id: m.id, measure_name: m.name, dimension: a.dimension, member_id: mem, basis: a.basis, review: a.review });

  // seed ONLY if the measures are already loaded (FK to measure_definitions); else defer.
  const existing = new Set(((await db.execute(sql`SELECT id FROM measure_definitions`)).rows ?? []).map((r: any) => r.id));
  const loadable = rows.filter((r) => existing.has(r.measure_id));
  if (loadable.length === rows.length) {
    await db.execute(sql`TRUNCATE TABLE measure_dimension_applicability`);
    for (const r of rows) await db.execute(sql`INSERT INTO measure_dimension_applicability (measure_id, dimension, member_id) VALUES (${r.measure_id}, ${r.dimension}, ${r.member_id}) ON CONFLICT DO NOTHING`);
    console.log("applicability rows SEEDED:", rows.length);
  } else {
    console.log(`SEED DEFERRED — ${rows.length - loadable.length}/${rows.length} rows reference measures not yet loaded. Workbook+JSON produced; re-run after the measures load.`);
  }
  console.log("total rows:", rows.length, "| review-flagged:", rows.filter((r) => r.review).length);

  // member names for the workbook
  const mem = await db.execute(sql`SELECT id, name FROM managed_list_items`);
  const memName = new Map(((mem.rows ?? mem) as any[]).map((r) => [r.id, r.name]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("applicability");
  ws.addRow(["measure_id", "measure_name", "dimension", "member_id", "member", "basis", "review?"]);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) { const row = ws.addRow([r.measure_id, r.measure_name, r.dimension, r.member_id, memName.get(r.member_id) ?? "?", r.basis, r.review ? "REVIEW" : ""]); if (r.review) row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; }
  ws.columns.forEach((c, i) => (c.width = [12, 34, 16, 11, 18, 34, 10][i]));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  await wb.xlsx.writeFile("C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/measure_dimension_applicability - draft.xlsx");
  writeFileSync("docs/measures-enrichment/measure-dimension-applicability.json", JSON.stringify(rows, null, 1));
  console.log("written workbook + json");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
