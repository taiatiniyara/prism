// Fix SAIDI/SAIFI denominators (DATA-QUALITY finding #2) and the Engine Oil
// bindings (follow-up to finding #4). Guarded on exact current state; safe to
// re-run and to run on prod AFTER migrate-customers-served.ts.
//
// Binding tags: the interruption-event rows and the customers rows are all
// tagged provider=Utility(21), source=All GEN(40) => derived type=All(30);
// the engine matches all three dimensions exactly, so every binding that
// reads those rows must carry the full triple.
// Run: node --env-file=.env --import tsx scripts/fix-saifi-formulas.ts
import { Pool } from "pg";

import { evaluateKpiFormula } from "../app/data-entry/kpi-worker/evaluator";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ALL_GEN_TAG = {
  energy_provider_id: 21,
  energy_type_id: 30,
  energy_source_id: 40,
};

const CUSTOMERS = {
  measure_def_id: 1501,
  variable_name: "electricity_customers_metered_connections",
  ...ALL_GEN_TAG,
};

interface DefUpdate {
  kpiId: number;
  name: string;
  guardSql: string; // extra WHERE conditions asserting current broken state
  formula: string;
  inputs: unknown[];
}

const UPDATES: DefUpdate[] = [
  {
    kpiId: 124,
    name: "Planned SAIFI — divide by customers served (finding #2)",
    guardSql: `formula = 'total_planned_interruptions_events / total_planned_interruptions_customers_affected'`,
    formula:
      "total_planned_interruptions_events / electricity_customers_metered_connections",
    inputs: [
      {
        measure_def_id: 1800,
        variable_name: "total_planned_interruptions_events",
        ...ALL_GEN_TAG,
      },
      CUSTOMERS,
    ],
  },
  {
    kpiId: 126,
    name: "Unplanned SAIFI — author missing formula (finding #2)",
    guardSql: `(formula is null or trim(formula) = '')`,
    formula:
      "total_unplanned_interruptions_events / electricity_customers_metered_connections",
    inputs: [
      {
        measure_def_id: 1803,
        variable_name: "total_unplanned_interruptions_events",
        ...ALL_GEN_TAG,
      },
      CUSTOMERS,
    ],
  },
  {
    kpiId: 123,
    name: "Planned SAIDI — divide by customers served (denominator prep; numerator input 1802 still has no data, so this cannot compute yet)",
    guardSql: `formula = 'total_planned_interruptions_customer_duration / total_planned_interruptions_customers_affected'`,
    formula:
      "total_planned_interruptions_customer_duration / electricity_customers_metered_connections",
    inputs: [
      {
        measure_def_id: 1802,
        variable_name: "total_planned_interruptions_customer_duration",
      },
      CUSTOMERS,
    ],
  },
  {
    kpiId: 106,
    name: "Engine Oil Consumption — bindings tagged Diesel(46) but oil/generation rows are tagged All GEN(40); retag so the KPI can resolve",
    guardSql: `formula = 'electricity_generated / oil_for_generators' and formula_inputs::jsonb = '[{"measure_def_id":1652,"variable_name":"electricity_generated","energy_provider_id":21,"energy_type_id":null,"energy_source_id":46},{"measure_def_id":1659,"variable_name":"oil_for_generators","energy_provider_id":21,"energy_type_id":null,"energy_source_id":46}]'::jsonb`,
    formula: "electricity_generated / oil_for_generators",
    inputs: [
      {
        measure_def_id: 1652,
        variable_name: "electricity_generated",
        ...ALL_GEN_TAG,
      },
      {
        measure_def_id: 1659,
        variable_name: "oil_for_generators",
        ...ALL_GEN_TAG,
      },
    ],
  },
];

async function main() {
  for (const u of UPDATES) {
    const vars = Object.fromEntries(
      (u.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((v, i) => [
        v,
        i + 2,
      ]),
    );
    const result = evaluateKpiFormula(u.formula, vars);
    if (result.status !== "ok") {
      throw new Error(
        `Formula for KPI ${u.kpiId} does not evaluate: ${result.failureReason}`,
      );
    }
  }
  console.log("evaluator OK for all new formulas");

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const u of UPDATES) {
      const res = await client.query(
        `update kpi_definitions
         set formula = $1, formula_inputs = $2::json, updated_at = now()
         where id = $3 and ${u.guardSql}`,
        [u.formula, JSON.stringify(u.inputs), u.kpiId],
      );
      console.log(
        `${res.rowCount === 1 ? "UPDATED" : "SKIPPED (state differs — already updated or drifted)"} [${u.kpiId}] ${u.name}`,
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  const after = await pool.query(
    `select id, name, formula, formula_inputs from kpi_definitions
     where id = any($1::int[]) order by id`,
    [UPDATES.map((u) => u.kpiId)],
  );
  console.log("\nPost-fix state:");
  for (const r of after.rows) {
    console.log(`  [${r.id}] ${r.name}: ${r.formula}`);
    console.log(`      inputs: ${JSON.stringify(r.formula_inputs)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
