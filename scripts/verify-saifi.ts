// Verify the corrected SAIFI / Engine Oil definitions END-TO-END through the
// real engine: pick live scopes, resolve inputs via the actual KPI-worker
// resolver, evaluate the stored formula, and compare with a direct SQL
// hand-computation. Read-only.
// Run: node --env-file=.env --import tsx scripts/verify-saifi.ts
import { Pool } from "pg";

import { evaluateKpiFormula } from "../app/data-entry/kpi-worker/evaluator";
import { resolveFormulaInputValues } from "../app/data-entry/kpi-worker/resolveInputs";
import type { FormulaInput } from "../db/schema/dataEntry";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface Check {
  kpiId: number;
  numeratorInput: number;
  denominatorInput: number;
}

const CHECKS: Check[] = [
  { kpiId: 124, numeratorInput: 1800, denominatorInput: 1501 }, // Planned SAIFI
  { kpiId: 126, numeratorInput: 1803, denominatorInput: 1501 }, // Unplanned SAIFI
  { kpiId: 106, numeratorInput: 1652, denominatorInput: 1659 }, // Engine Oil
];

async function main() {
  let failures = 0;

  for (const check of CHECKS) {
    const [def] = (
      await pool.query(
        `select id, name, formula, formula_inputs, agg_level_id
         from kpi_definitions where id = $1`,
        [check.kpiId],
      )
    ).rows;

    // Latest scope having a valued row for BOTH inputs on the same
    // (period, service area, resource) with the All GEN tag.
    const [scope] = (
      await pool.query(
        `select n.report_period_id, n.service_area_id, n.energy_resource_id,
                rp.report_date::date as period, sa.name as service_area,
                n.value as num_value, d.value as den_value
         from data_entries n
         join data_entries d
           on d.report_period_id = n.report_period_id
          and d.service_area_id is not distinct from n.service_area_id
          and d.energy_resource_id is not distinct from n.energy_resource_id
          and d.measure_def_id = $2 and d.is_deleted = false
          and d.value is not null and trim(d.value) <> ''
         join report_periods rp on rp.id = n.report_period_id
         left join service_areas sa on sa.id = n.service_area_id
         where n.measure_def_id = $1 and n.is_deleted = false
           and n.value is not null and trim(n.value) <> ''
           and n.value ~ '^[0-9.]+$' and d.value ~ '^[0-9.]+$'
           and d.value::numeric <> 0
           and n.customer_type_id is null and n.payment_mode_id is null
           and d.customer_type_id is null and d.payment_mode_id is null
         order by rp.report_date desc
         limit 1`,
        [check.numeratorInput, check.denominatorInput],
      )
    ).rows;

    if (!scope) {
      console.log(`[${def.id}] ${def.name}: NO live scope found — skipped`);
      continue;
    }

    const expected = Number(scope.num_value) / Number(scope.den_value);

    const resolved = await resolveFormulaInputValues({
      formulaInputs: def.formula_inputs as FormulaInput[],
      kpiAggLevelId: def.agg_level_id,
      scope: {
        reportPeriodId: scope.report_period_id,
        serviceAreaId: scope.service_area_id,
        energyResourceId: scope.energy_resource_id,
        customerTypeId: null,
        paymentModeId: null,
      },
    });

    if (resolved.missingVariables.length > 0) {
      failures += 1;
      console.log(
        `[${def.id}] ${def.name}: FAIL — engine reports missing inputs: ${resolved.missingVariables.join(", ")}`,
      );
      continue;
    }

    const evaluated = evaluateKpiFormula(def.formula, resolved.variables);
    const engineValue = Number(evaluated.value);
    const ok =
      evaluated.status === "ok" && Math.abs(engineValue - expected) < 1e-9;
    if (!ok) failures += 1;

    console.log(
      `[${def.id}] ${def.name}: ${ok ? "PASS" : "FAIL"} | scope ${scope.period.toISOString().slice(0, 10)} ${scope.service_area ?? "(no SA)"} | hand: ${scope.num_value} / ${scope.den_value} = ${expected.toFixed(6)} | engine: ${evaluated.value ?? evaluated.failureReason}`,
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} verification failure(s)`);
    process.exit(1);
  }
  console.log("\nAll verifications passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
