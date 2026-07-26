import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const FILE = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/measure_dimension_scope - draft.xlsx";
const OUT = "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Decisions/measure_dimension_scope - final.xlsx";
const DIMS = ["provider", "type", "source", "resource_type", "customer_type", "payment_mode", "band", "division", "gender", "utility_function"];
const N = "not_applicable", A = "all_members", C = "by_context";
// utility_function -> not_applicable on these (grid-level / period constants)
const REVERT_FN = new Set([300, 400, 401, 431]);

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const upd = wb.getWorksheet("scope_matrix_updated")!;
  const H = (upd.getRow(1).values as string[]).slice(1);
  const col = (n: string) => H.indexOf(n) + 1;
  const dimCol = DIMS.map((d) => col(d));

  const measures: any[] = [];
  for (let r = 2; r <= upd.rowCount; r++) {
    const row = upd.getRow(r);
    const id = row.getCell(col("id")).value as number;
    if (id == null) continue;
    const m: any = { id, name: row.getCell(col("name")).value, category: row.getCell(col("category")).value, subcategory: row.getCell(col("subcategory")).value };
    DIMS.forEach((d, i) => (m[d] = String(row.getCell(dimCol[i]).value ?? "").trim() || N));
    if (REVERT_FN.has(id)) m.utility_function = N;
    measures.push(m);
  }

  // Validate
  const VALID = new Set([N, A, C]);
  const bad = measures.flatMap((m) => DIMS.filter((d) => !VALID.has(m[d])).map((d) => `${m.id} ${d}=${m[d]}`));
  console.log("measures:", measures.length, "| invalid modes:", bad.length ? bad.join(", ") : "none");

  const scopeRows: any[] = [];
  for (const m of measures) for (const d of DIMS) scopeRows.push({ measure_id: m.id, measure_name: m.name, dimension: d, expansion_mode: m[d] });
  const mc = (mode: string) => scopeRows.filter((r) => r.expansion_mode === mode).length;
  console.log("rows:", scopeRows.length, "| by_context:", mc(C), "| all_members:", mc(A), "| not_applicable:", mc(N));
  console.log("dimension-free measures:", measures.filter((m) => DIMS.every((d) => m[d] === N)).length);

  // Write final workbook
  const out = new ExcelJS.Workbook();
  const s1 = out.addWorksheet("scope_matrix");
  const H1 = ["id", "name", "category", "subcategory", ...DIMS];
  s1.addRow(H1); s1.getRow(1).font = { bold: true }; s1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
  for (const m of measures) {
    const row = s1.addRow(H1.map((h) => m[h] ?? ""));
    DIMS.forEach((d, i) => { const c = row.getCell(5 + i); if (m[d] === C) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; else if (m[d] === A) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } }; });
  }
  s1.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  s1.columns.forEach((c, i) => (c.width = H1[i] === "name" ? 32 : 14));
  const s2 = out.addWorksheet("scope_rows");
  s2.addRow(["measure_id", "measure_name", "dimension", "expansion_mode"]); s2.getRow(1).font = { bold: true };
  for (const r of scopeRows) s2.addRow([r.measure_id, r.measure_name, r.dimension, r.expansion_mode]);
  s2.columns.forEach((c, i) => (c.width = [12, 32, 16, 16][i]));
  await out.xlsx.writeFile(OUT);
  writeFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", JSON.stringify(scopeRows, null, 1));
  console.log("\nwritten:", OUT);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
