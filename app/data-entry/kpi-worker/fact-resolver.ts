import type { FormulaInput } from "@/db/schema/dataEntry";

import {
  pickInputValue,
  selectGrainCandidates,
  strataShouldRollup,
} from "./dimension-rollup";
import type { RollupCandidate } from "./dimension-rollup";
import {
  DbCountryContextReader,
  type CountryContextReader,
} from "./country-context-reader";
import { DbFactSource, type FactSource } from "./fact-source";
import { normalizeFormulaInput } from "./normalizeFormulaInput";
import type { KpiWorkerScope } from "./types";

export interface ResolveInputsRequest {
  formulaInputs: FormulaInput[];
  kpiAggLevelId: number | null;
  scope: KpiWorkerScope;
}

export interface ResolvedFormulaInputs {
  variables: Record<string, number>;
  missingVariables: string[];
}

export interface FactResolverDeps {
  facts?: FactSource;
  context?: CountryContextReader;
}

/**
 * The fact resolver: given a formula's input bindings and an evaluation scope,
 * produce a numeric value for each variable (or list it as missing).
 *
 * `resolve` is the orchestration only — it fetches through the injected
 * `FactSource` / `CountryContextReader` and applies the pure rules from
 * `dimension-rollup.ts`. Pass fakes in tests; the defaults are the real DB
 * adapters.
 */
export const createFactResolver = (deps: FactResolverDeps = {}) => {
  const facts = deps.facts ?? new DbFactSource();
  const context = deps.context ?? new DbCountryContextReader();

  const resolve = async (
    request: ResolveInputsRequest,
  ): Promise<ResolvedFormulaInputs> => {
    const formulaInputs = request.formulaInputs
      .map(normalizeFormulaInput)
      .filter((input): input is FormulaInput => input != null);

    if (formulaInputs.length === 0) {
      return { variables: {}, missingVariables: [] };
    }

    const inputDefIds = [
      ...new Set(formulaInputs.map((item) => item.measure_def_id)),
    ];

    const meta = await facts.measureMeta(inputDefIds);
    const contextFedIds = new Set(
      inputDefIds.filter((id) => meta.get(id)?.isContextFed),
    );

    // Context-fed inputs → national as-of figures; the rest → dimensioned rows.
    const contextValues =
      contextFedIds.size > 0
        ? await context.valuesForPeriod(
            [...contextFedIds],
            request.scope.reportPeriodId,
          )
        : new Map<number, number | null>();

    const regularInputDefIds = inputDefIds.filter(
      (id) => !contextFedIds.has(id),
    );

    // The KPI target grain is set by the scope: a pinned unit/service area
    // targets that level; otherwise the target is the utility and we roll the
    // sub-utility rows up to it (§4.6 grain rollup).
    const rollUpGrain =
      request.scope.serviceAreaId == null && request.scope.unitId == null;

    const rows = await facts.dimensionedRows({
      reportPeriodId: request.scope.reportPeriodId,
      measureIds: regularInputDefIds,
      serviceAreaId: request.scope.serviceAreaId ?? null,
      unitId: request.scope.unitId ?? null,
    });

    const byMeasure = new Map<number, RollupCandidate[]>();
    for (const row of rows) {
      const bucket = byMeasure.get(row.measureDefId) ?? [];
      bucket.push(row);
      byMeasure.set(row.measureDefId, bucket);
    }

    const variables: Record<string, number> = {};
    const missingVariables: string[] = [];

    for (const formulaInput of formulaInputs) {
      if (contextFedIds.has(formulaInput.measure_def_id)) {
        const value =
          contextValues.get(formulaInput.measure_def_id) ?? null;
        if (value == null) {
          missingVariables.push(formulaInput.variable_name);
        } else {
          variables[formulaInput.variable_name] = value;
        }
        continue;
      }

      const sourceRows = byMeasure.get(formulaInput.measure_def_id) ?? [];
      const strataRollup = strataShouldRollup(
        request.kpiAggLevelId,
        meta.get(formulaInput.measure_def_id)?.strataId ?? null,
      );

      const grain = selectGrainCandidates(sourceRows, rollUpGrain);
      if (grain.mixedLevels.length > 0) {
        console.warn(
          `[kpi-worker] measure ${formulaInput.measure_def_id} period ${request.scope.reportPeriodId}: mixed grain levels ${grain.mixedLevels.join(",")} — rolled up coarsest only`,
        );
      }

      const value = pickInputValue({
        candidateRows: grain.candidates,
        binding: formulaInput,
        scope: {
          customerTypeId: request.scope.customerTypeId ?? null,
          paymentModeId: request.scope.paymentModeId ?? null,
        },
        grainRollup: strataRollup || grain.summed,
      });

      if (value == null) {
        missingVariables.push(formulaInput.variable_name);
      } else {
        variables[formulaInput.variable_name] = value;
      }
    }

    return { variables, missingVariables };
  };

  return { resolve };
};
