// Fix the unambiguous KPI formula bugs from DATA-QUALITY-FINDINGS (2026-07-08).
// Each UPDATE is guarded on the exact current broken formula text, so the
// script is safe to re-run and safe on prod (it no-ops if the text differs).
// Run: node --env-file=.env --import tsx scripts/fix-formula-bugs.ts
import { Pool } from "pg";

import { evaluateKpiFormula } from "../app/data-entry/kpi-worker/evaluator";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface Fix {
  kpiId: number;
  name: string;
  expectBroken: string;
  fixedFormula: string;
  // When set, formula_inputs is replaced too (KPI 61 gains a binding).
  fixedInputs?: unknown[];
}

const FIXES: Fix[] = [
  {
    kpiId: 61,
    name: "Total Employees Male — add missing human_resource term (finding #1)",
    expectBroken:
      "administrative_employees_male + executive_employees_male + finance_employees_male + ict_employees_male + other_employees_male + pr_marketing_and_customer_service_employees_male + procurement_employees_male + technical_employees_male",
    fixedFormula:
      "administrative_employees_male + executive_employees_male + finance_employees_male + human_resource_employees_male + ict_employees_male + other_employees_male + pr_marketing_and_customer_service_employees_male + procurement_employees_male + technical_employees_male",
    fixedInputs: [
      { measure_def_id: 1420, variable_name: "administrative_employees_male" },
      { measure_def_id: 1402, variable_name: "executive_employees_male" },
      { measure_def_id: 1408, variable_name: "finance_employees_male" },
      { measure_def_id: 1414, variable_name: "human_resource_employees_male" },
      { measure_def_id: 1423, variable_name: "ict_employees_male" },
      { measure_def_id: 1426, variable_name: "other_employees_male" },
      {
        measure_def_id: 1417,
        variable_name: "pr_marketing_and_customer_service_employees_male",
      },
      { measure_def_id: 1411, variable_name: "procurement_employees_male" },
      { measure_def_id: 1405, variable_name: "technical_employees_male" },
    ],
  },
  {
    kpiId: 98,
    name: "Generator Availability Factor — balance parentheses (finding #3)",
    expectBroken:
      "( hours_in_period - ( downtime_planned_duration + downtime_unplanned_duration ) / hours_in_period",
    fixedFormula:
      "( hours_in_period - ( downtime_planned_duration + downtime_unplanned_duration ) ) / hours_in_period",
  },
  {
    kpiId: 106,
    name: "Engine Oil Consumption — invert to match kWh/litre unit and balance parens (finding #4)",
    expectBroken: "( oil_for_generators ) / ( electricity_generated",
    fixedFormula: "electricity_generated / oil_for_generators",
  },
  {
    kpiId: 31,
    name: "Transmission and Distribution Labor Costs — missing '/' operator (new finding)",
    expectBroken:
      "( staff_costs_transmission + staff_costs_distribution ) service_total_costs",
    fixedFormula:
      "( staff_costs_transmission + staff_costs_distribution ) / service_total_costs",
  },
];

async function main() {
  // Sanity-check every fixed formula with the real evaluator before touching
  // the DB: every variable gets a dummy value; result must be finite.
  for (const fix of FIXES) {
    const vars = Object.fromEntries(
      (fix.fixedFormula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((v, i) => [
        v,
        i + 2,
      ]),
    );
    const result = evaluateKpiFormula(fix.fixedFormula, vars);
    if (result.status !== "ok") {
      throw new Error(
        `Fixed formula for KPI ${fix.kpiId} does not evaluate: ${result.failureReason}`,
      );
    }
    console.log(
      `evaluator OK  [${fix.kpiId}] ${fix.fixedFormula} -> ${result.value}`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const fix of FIXES) {
      const res = fix.fixedInputs
        ? await client.query(
            `update kpi_definitions
             set formula = $1, formula_inputs = $2::json, updated_at = now()
             where id = $3 and formula = $4`,
            [
              fix.fixedFormula,
              JSON.stringify(fix.fixedInputs),
              fix.kpiId,
              fix.expectBroken,
            ],
          )
        : await client.query(
            `update kpi_definitions
             set formula = $1, updated_at = now()
             where id = $2 and formula = $3`,
            [fix.fixedFormula, fix.kpiId, fix.expectBroken],
          );

      console.log(
        `${res.rowCount === 1 ? "FIXED  " : "SKIPPED (text differs — already fixed or drifted)"} [${fix.kpiId}] ${fix.name}`,
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  // Read back the four definitions for the record.
  const after = await pool.query(
    `select id, name, formula from kpi_definitions where id = any($1::int[]) order by id`,
    [FIXES.map((f) => f.kpiId)],
  );
  console.log("\nPost-fix state:");
  for (const r of after.rows) {
    console.log(`  [${r.id}] ${r.name}: ${r.formula}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
