import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const rows = JSON.parse(
  readFileSync("docs/measures-enrichment/measures-enriched-final.json", "utf8"),
);
const DIMS = ["provider", "type", "source", "resource_type", "customer_type", "payment_mode", "band", "division", "gender", "utility_function"];
const N = "not_applicable", A = "all_members", C = "by_context";

function scope(m: any): { modes: Record<string, string>; note: string } {
  const modes: Record<string, string> = Object.fromEntries(DIMS.map((d) => [d, N]));
  let note = "";
  const sub = m.subcategory as string;
  const name = String(m.name);
  const cat = m.category as string;
  const set = (o: Record<string, string>) => Object.assign(modes, o);

  // OPERATIONAL
  if (sub === "Electricity Generated") { set({ provider: C, type: C, source: C, resource_type: C }); note = "generation: sliced by provider/type/source/resource-type via equipment registry"; }
  else if (["Electricity Stored", "Electricity Discharged"].includes(sub) || /charging/i.test(name)) { set({ provider: C, type: C, source: C, resource_type: C }); note = "storage: sliced by source/resource-type (ESS) via registry"; }
  else if (sub === "Fuel and Oil") { set({ provider: C, type: C, source: C, resource_type: C }); note = "fuel/oil consumed per generating unit"; }
  else if (sub === "Capacity") { set({ provider: C, type: C, source: C, resource_type: C }); note = "rated capacity per unit"; }
  else if (sub === "Downtime") { set({ provider: C, type: C, source: C, resource_type: C, utility_function: C }); note = "generator downtime sliced by provider/type/source (equipment); transmission & distribution downtime sliced by utility_function (confirmed 2026-07-22)"; }
  else if (sub === "Interruptions") { note = "supply-interruption events at service-area; planned/unplanned are separate measures, not a dimension"; }
  else if (sub === "Network") { set({ utility_function: C }); note = "network measure — Transmission vs Distribution via function"; }
  else if (sub === "Transformers") { set({ utility_function: C }); note = "transformer — Transmission vs Distribution via function"; }
  else if (sub === "Electricity Consumed") {
    if (/sold to customers/i.test(name)) { set({ customer_type: C, payment_mode: C }); note = "sales: lump-sum now, sliced by customer_type x payment_mode from next entry round (confirmed 2026-07-22)"; }
    else if (/charging/i.test(name)) { set({ provider: C, type: C, source: C, resource_type: C }); note = "ESS charging input"; }
    else note = "consumption at utility/area level";
  }
  else if (sub === "Electricity Purchased") { set({ provider: C, type: C, source: C }); note = "purchases sliced by provider (IPP/Customer) + source"; }
  else if (sub === "Electricity Sent") { note = "net energy sent to grid — utility/area level"; }
  else if (sub === "Electricity Demand") { note = "grid demand — area level, no dimension slicing"; }
  else if (sub === "Customers") { set({ customer_type: C, payment_mode: C }); note = "customer count: lump-sum now, by customer_type x payment_mode from next round (confirmed 2026-07-22)"; }
  else if (sub === "Period Hours") { note = "calendar hours in period — no slicing"; }
  else if (sub === "Solar Environment") { note = "environmental readings — no dimension slicing"; }

  // FINANCIAL
  else if (sub === "Cost Breakdown") {
    if (/electricity o&m|electricity staff/i.test(name)) { set({ utility_function: C }); note = "direct electricity cost split by function (Gen/Trans/Dist) per your confirmation"; }
    else if (/electricity purchases/i.test(name)) { set({ provider: C }); note = "power purchases by provider (IPP/Customer)"; }
    else if (/fuel & oil expenditure/i.test(name)) { set({ source: C }); note = "fuel cost by source, RESTRICTED to Diesel + Heavy Fuel members (confirmed 2026-07-22)"; }
    else note = "apportioned/other cost — utility-level total";
  }
  else if (sub === "Tariff Structure") {
    if (/block limit|rate per kwh/i.test(name)) { set({ customer_type: C, payment_mode: C, band: C }); note = "tariff by customer class x payment mode x block"; }
    else if (/fixed monthly charge/i.test(name)) { set({ customer_type: C, payment_mode: C }); note = "fixed charge by class x payment mode"; }
    else if (/vat|gst/i.test(name)) note = "tax rate — utility-level";
  }
  else if (sub === "Financial Accounts") {
    if (/^revenue$/i.test(name)) { set({ customer_type: C, payment_mode: C }); note = "revenue: lump-sum now, by customer_type x payment_mode from next round (confirmed 2026-07-22)"; }
    else note = "income-statement line — utility-level total";
  }
  else if (sub === "Foreign Exchange") note = "exchange rate — utility-level";

  // HR & SAFETY
  else if (cat === "HR & Safety") {
    if (sub === "FTE Employees" || /^employees$/i.test(name)) { set({ division: A, gender: A }); note = "headcount sliced across all divisions x genders"; }
    else if (sub === "Staff Utilization" || /hours worked/i.test(name)) { set({ division: A }); note = "hours by division (all divisions)"; }
    else if (sub === "Safety") note = "safety recorded at utility level — no dimension slicing (confirmed 2026-07-22)";
    else if (sub === "Gender") note = "option attribute (the value IS the gender) — no dimension slicing";
  }
  // Governance, Country & Utility Context -> all N/A
  return { modes, note };
}

async function main() {
const scopeRows: any[] = [];
const summary: any[] = [];
for (const m of rows) {
  const { modes, note } = scope(m);
  for (const d of DIMS) scopeRows.push({ measure_id: m.id, measure_name: m.name, dimension: d, expansion_mode: modes[d] });
  summary.push({ id: m.id, name: m.name, category: m.category, subcategory: m.subcategory, ...modes, review_note: note });
}
const mc = (mode: string) => scopeRows.filter((r) => r.expansion_mode === mode).length;
console.log("scope rows:", scopeRows.length, "| by_context:", mc(C), "| all_members:", mc(A), "| not_applicable:", mc(N));
console.log("measures flagged CONFIRM:", summary.filter((s) => /CONFIRM/.test(s.review_note)).length);
console.log("measures with NO applicable dimension:", summary.filter((s) => DIMS.every((d) => s[d] === N)).length);

const wb = new ExcelJS.Workbook();
const s1 = wb.addWorksheet("scope_matrix");
const H1 = ["id", "name", "category", "subcategory", ...DIMS, "review_note"];
s1.addRow(H1); s1.getRow(1).font = { bold: true }; s1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
for (const s of summary) {
  const row = s1.addRow(H1.map((h) => s[h] ?? ""));
  DIMS.forEach((d, i) => {
    const c = row.getCell(5 + i);
    if (s[d] === C) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    else if (s[d] === A) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } };
  });
}
s1.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
s1.columns.forEach((c, i) => (c.width = H1[i] === "review_note" ? 55 : H1[i] === "name" ? 32 : 14));
const s2 = wb.addWorksheet("scope_rows");
s2.addRow(["measure_id", "measure_name", "dimension", "expansion_mode"]); s2.getRow(1).font = { bold: true };
for (const r of scopeRows) s2.addRow([r.measure_id, r.measure_name, r.dimension, r.expansion_mode]);
s2.columns.forEach((c, i) => (c.width = [12, 32, 16, 16][i]));
const OUT = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/measure_dimension_scope - draft.xlsx";
await wb.xlsx.writeFile(OUT);
writeFileSync("docs/measures-enrichment/measure-dimension-scope.json", JSON.stringify(scopeRows, null, 1));
console.log("\nwritten:", OUT);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
