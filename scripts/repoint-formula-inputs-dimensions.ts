/**
 * §4.7 — First-cut re-point of formula_inputs onto the 10-dimension model.
 *
 * For every definition that carries `formula_inputs` (both `measure_definitions`
 * and `kpi_definitions`), each input references a source measure
 * (`measure_def_id`). This script inspects the dimension tags that actually
 * exist on that source measure's data and proposes an explicit slice for each
 * of the ten dimensions — the "No NULL-as-All" fix (doc §0.4), done the same
 * data-driven way as the 2026-07-08 SAIFI re-pointing.
 *
 * First-cut rule, per source measure, per dimension:
 *   - keep any value the input already sets explicitly;
 *   - else if the measure's live rows carry exactly ONE distinct non-All value
 *     on that dimension  → bind to that value (the data is inherently sliced);
 *   - else if the rows carry MULTIPLE non-All values → leave unset and FLAG it
 *     (never guess a slice — the SAIFI-grade choice is bespoke);
 *   - else (whole dimension / no data) → bind the canonical All member.
 *
 * Two checks generalise from the SAIFI scripts and run on every dry-run:
 *   - FORMULA GATE (from fix-saifi-formulas.ts): each definition's stored
 *     formula is run through the real evaluateKpiFormula; broken formulas are
 *     reported (they are a manual, semantic fix — out of scope for this script).
 *   - ALIGNMENT REPORT (from verify-saifi.ts): for multi-input definitions,
 *     count the (period, service_area, energy_resource) scopes where ALL inputs
 *     have a value at once. Zero → the KPI can never compute; flag it.
 *
 * Read-only by default. Pass --apply to write. Always run the dry-run first.
 *   Dry-run: node --env-file=.env --import tsx scripts/repoint-formula-inputs-dimensions.ts
 *   Apply:   node --env-file=.env --import tsx scripts/repoint-formula-inputs-dimensions.ts --apply
 */
import { Pool } from "pg";

import { evaluateKpiFormula } from "../app/data-entry/kpi-worker/evaluator";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = process.argv.includes("--apply");

// Canonical All-member id per dimension column (doc §1.2; mirrors
// lib/data-entry/dimensions.ts — kept inline so this script stays self-contained).
const ALL_MEMBER: Record<string, number> = {
  energy_provider_id: 20,
  energy_type_id: 30,
  energy_source_id: 40,
  energy_resource_type_id: 983,
  customer_type_id: 690,
  payment_mode_id: 720,
  consumption_band_id: 1005,
  division_id: 1011,
  gender_id: 1022,
  utility_function_id: 1023,
};
const DIM_COLUMNS = Object.keys(ALL_MEMBER);
const VALUED = `coalesce(value_numeric::text, value) is not null
  and trim(coalesce(value_numeric::text, value)) <> ''`;

interface FormulaInput {
  measure_def_id: number;
  variable_name: string;
  [dim: string]: number | string | null | undefined;
}

interface DefRow {
  table: "measure_definitions" | "kpi_definitions";
  id: number;
  name: string;
  formula: string | null;
  formula_inputs: FormulaInput[] | null;
}

/** Distinct non-null values present on each source measure, per dimension. */
async function loadDimensionTags(
  measureDefIds: number[],
): Promise<Map<number, Map<string, Set<number>>>> {
  const byMeasure = new Map<number, Map<string, Set<number>>>();
  if (measureDefIds.length === 0) return byMeasure;

  const rows = await pool.query<Record<string, number | null>>(
    `select measure_def_id, ${DIM_COLUMNS.join(", ")}
       from data_entries
      where measure_def_id = any($1::int[])
        and is_deleted = false
        and ${VALUED}
      group by measure_def_id, ${DIM_COLUMNS.join(", ")}`,
    [measureDefIds],
  );

  for (const row of rows.rows) {
    const mid = row.measure_def_id as number;
    let dims = byMeasure.get(mid);
    if (!dims) {
      dims = new Map(DIM_COLUMNS.map((c) => [c, new Set<number>()]));
      byMeasure.set(mid, dims);
    }
    for (const col of DIM_COLUMNS) {
      const v = row[col];
      if (v != null) dims.get(col)!.add(v);
    }
  }
  return byMeasure;
}

interface InputResult {
  next: FormulaInput;
  changes: string[];
  flags: string[];
}

/** Apply the first-cut rule to one input. */
function repointInput(
  input: FormulaInput,
  tags: Map<string, Set<number>> | undefined,
): InputResult {
  const next: FormulaInput = { ...input };
  const changes: string[] = [];
  const flags: string[] = [];

  for (const col of DIM_COLUMNS) {
    if (input[col] != null) continue; // keep explicit bindings untouched

    const present = tags?.get(col);
    const nonAll = present
      ? [...present].filter((v) => v !== ALL_MEMBER[col])
      : [];

    if (nonAll.length === 1) {
      next[col] = nonAll[0];
      changes.push(`${col}: (unset) -> ${nonAll[0]}`);
    } else if (nonAll.length > 1) {
      // Multiple real slices — refuse to guess; leave unset for manual choice.
      flags.push(`${col} spans {${nonAll.sort((a, b) => a - b).join(", ")}}`);
    } else {
      next[col] = ALL_MEMBER[col];
      changes.push(`${col}: (unset) -> ${ALL_MEMBER[col]} (All)`);
    }
  }
  return { next, changes, flags };
}

/** FORMULA GATE — does the stored formula evaluate at all? */
function formulaError(formula: string | null): string | null {
  if (!formula || formula.trim() === "") return "empty formula";
  const names = [...new Set(formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
  const vars = Object.fromEntries(names.map((n, i) => [n, i + 2]));
  const res = evaluateKpiFormula(formula, vars);
  return res.status === "ok" ? null : (res.failureReason ?? "evaluator error");
}

/** ALIGNMENT — scopes where ALL of a definition's inputs are valued at once. */
async function alignedScopeCount(inputIds: number[]): Promise<number> {
  const distinct = [...new Set(inputIds)];
  if (distinct.length < 2) return -1; // not a multi-input ratio; N/A
  const res = await pool.query<{ n: number }>(
    `select count(*)::int as n from (
       select report_period_id, service_area_id, energy_resource_id
         from data_entries
        where measure_def_id = any($1::int[]) and is_deleted = false and ${VALUED}
        group by 1, 2, 3
       having count(distinct measure_def_id) = $2
     ) t`,
    [distinct, distinct.length],
  );
  return res.rows[0]?.n ?? 0;
}

async function main() {
  const defs: DefRow[] = [];
  for (const table of ["measure_definitions", "kpi_definitions"] as const) {
    const res = await pool.query<DefRow>(
      `select '${table}'::text as table, id, name, formula, formula_inputs
         from ${table}
        where formula_inputs is not null
          and jsonb_array_length(formula_inputs::jsonb) > 0`,
    );
    defs.push(...res.rows);
  }

  const sourceIds = new Set<number>();
  for (const d of defs)
    for (const i of d.formula_inputs ?? [])
      if (typeof i.measure_def_id === "number") sourceIds.add(i.measure_def_id);
  const tagsByMeasure = await loadDimensionTags([...sourceIds]);

  let defsChanged = 0;
  let inputsChanged = 0;
  const multiSliceDefs: string[] = [];
  const brokenFormulaDefs: string[] = [];
  const misalignedDefs: string[] = [];
  const updates: { table: string; id: number; next: FormulaInput[] }[] = [];

  for (const d of defs) {
    const inputs = d.formula_inputs ?? [];
    const nextInputs: FormulaInput[] = [];
    const defLines: string[] = [];
    let defHasFlag = false;

    for (const input of inputs) {
      const { next, changes, flags } = repointInput(
        input,
        tagsByMeasure.get(input.measure_def_id),
      );
      nextInputs.push(next);
      if (changes.length === 0 && flags.length === 0) continue;

      const noData = !tagsByMeasure.has(input.measure_def_id);
      defLines.push(
        `    input measure_def_id=${input.measure_def_id} (${input.variable_name})` +
          (noData ? " [NO DATA -> All]" : ""),
      );
      if (changes.length > 0) inputsChanged += 1;
      for (const c of changes) defLines.push(`      ${c}`);
      for (const f of flags) {
        defHasFlag = true;
        defLines.push(`      ⚑ MULTI-SLICE (left unset): ${f}`);
      }
    }

    const fErr = formulaError(d.formula);
    const aligned = await alignedScopeCount(
      inputs.map((i) => i.measure_def_id),
    );

    if (defLines.length > 0 || fErr || aligned === 0) {
      console.log(`\n[${d.table} #${d.id}] ${d.name}`);
      if (fErr) {
        console.log(`    ⚑ FORMULA BROKEN (${fErr}) — manual fix, not re-pointed`);
        brokenFormulaDefs.push(`[${d.table} #${d.id}] ${d.name} — ${fErr}`);
      }
      if (aligned === 0) {
        console.log(
          `    ⚑ NO ALIGNED SCOPE — inputs never share a (period, SA, resource); KPI cannot compute`,
        );
        misalignedDefs.push(`[${d.table} #${d.id}] ${d.name}`);
      } else if (aligned > 0) {
        console.log(`    aligned scopes (all inputs valued together): ${aligned}`);
      }
      defLines.forEach((l) => console.log(l));
      if (defHasFlag) multiSliceDefs.push(`[${d.table} #${d.id}] ${d.name}`);
    }

    if (defLines.some((l) => l.includes("->"))) {
      defsChanged += 1;
      updates.push({ table: d.table, id: d.id, next: nextInputs });
    }
  }

  console.log(
    `\n${APPLY ? "APPLYING" : "DRY-RUN"} — ${inputsChanged} inputs across ${defsChanged} definitions would change (of ${defs.length} with formula_inputs).`,
  );
  console.log(`  ⚑ multi-slice (needs a manual dimension choice): ${multiSliceDefs.length}`);
  console.log(`  ⚑ broken formula (manual semantic fix):          ${brokenFormulaDefs.length}`);
  console.log(`  ⚑ no aligned scope (cannot compute):             ${misalignedDefs.length}`);
  for (const l of [...multiSliceDefs, ...brokenFormulaDefs, ...misalignedDefs])
    console.log(`      ${l}`);

  if (!APPLY) {
    console.log(
      "\nReview the flags above, then re-run with --apply. Flagged dimensions are left unset for you to bind by hand.",
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const u of updates) {
      await client.query(
        `update ${u.table} set formula_inputs = $1 where id = $2`,
        [JSON.stringify(u.next), u.id],
      );
    }
    await client.query("COMMIT");
    console.log(`\nApplied ${updates.length} definition updates.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
