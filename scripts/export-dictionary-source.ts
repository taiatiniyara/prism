import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const OUT_DIR = "docs/dictionary-drafts";

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const inputs = await db.execute(sql`
    SELECT i.id, i.name, i.variable_name,
           nullif(trim(i.description), '') AS current_description,
           nullif(trim(i.formula), '') AS formula,
           i.is_calculated, i.is_aggregated, i.is_mandatory, i.is_currency, i.is_descriptive,
           c.name AS category, s.name AS subcategory,
           u.name AS unit, dt.name AS data_type, al.name AS strata,
           i.valid_range_min, i.valid_range_max,
           i.alternative_names
    FROM measure_definitions  i
    LEFT JOIN managed_list_items c  ON c.id  = i.category_id
    LEFT JOIN managed_list_items s  ON s.id  = i.subcategory_id
    LEFT JOIN managed_list_items u  ON u.id  = i.unit_id
    LEFT JOIN managed_list_items dt ON dt.id = i.data_type_id
    LEFT JOIN managed_list_items al ON al.id = i.strata_id
    WHERE i.is_active
    ORDER BY c.name, s.name, i.name
  `);

  const kpis = await db.execute(sql`
    SELECT k.id, k.name,
           nullif(trim(k.description), '') AS current_description,
           nullif(trim(k.formula), '') AS formula,
           k.formula_inputs, k.type, k.is_aggregated, k.is_currency,
           c.name AS category, s.name AS subcategory,
           u.name AS unit, al.name AS strata,
           b.description AS benchmark_description, b.direction,
           b.developing_nation_benchmark, b.developed_nation_benchmark,
           b.pacific_regional_average, b.ppa_target, b.unit AS benchmark_unit
    FROM kpi_definitions k
    LEFT JOIN managed_list_items c  ON c.id  = k.category_id
    LEFT JOIN managed_list_items s  ON s.id  = k.subcategory_id
    LEFT JOIN managed_list_items u  ON u.id  = k.unit_id
    LEFT JOIN managed_list_items al ON al.id = k.strata_id
    LEFT JOIN ai_benchmark b ON lower(b.kpi_name) = lower(k.name)
    WHERE k.is_active
    ORDER BY c.name, s.name, k.name
  `);

  // Reverse lookup: which KPIs consume each input variable
  const inputRows =
    inputs.rows ?? (inputs as unknown as Record<string, unknown>[]);
  const kpiRows = kpis.rows ?? (kpis as unknown as Record<string, unknown>[]);

  const idToVar = new Map<number, string>();
  for (const r of inputRows as { id: number; variable_name: string }[]) {
    idToVar.set(Number(r.id), r.variable_name);
  }

  const usedBy = new Map<string, string[]>();
  for (const k of kpiRows as { name: string; formula_inputs: unknown }[]) {
    const fi = Array.isArray(k.formula_inputs) ? k.formula_inputs : [];
    for (const f of fi as { measure_def_id?: number }[]) {
      const v =
        f.measure_def_id != null
          ? idToVar.get(Number(f.measure_def_id))
          : undefined;
      if (v) {
        if (!usedBy.has(v)) usedBy.set(v, []);
        if (!usedBy.get(v)!.includes(k.name)) usedBy.get(v)!.push(k.name);
      }
    }
  }

  const inputsOut = (inputRows as { variable_name: string }[]).map((r) => ({
    ...r,
    used_by_kpis: usedBy.get(r.variable_name) ?? [],
  }));

  writeFileSync(
    `${OUT_DIR}/source-inputs.json`,
    JSON.stringify(inputsOut, null, 1),
  );
  writeFileSync(
    `${OUT_DIR}/source-kpis.json`,
    JSON.stringify(kpiRows, null, 1),
  );

  const cats = (arr: { category: string | null }[]) => {
    const m = new Map<string, number>();
    for (const r of arr)
      m.set(r.category ?? "?", (m.get(r.category ?? "?") ?? 0) + 1);
    return [...m.entries()];
  };
  console.log(
    "inputs:",
    inputsOut.length,
    JSON.stringify(cats(inputsOut as never)),
  );
  console.log("kpis:", kpiRows.length, JSON.stringify(cats(kpiRows as never)));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
