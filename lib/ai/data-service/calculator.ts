import { db } from "@/db/connection";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { desc, eq, and, like, sql, or, inArray } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";
import { resolveFormulaInputValues } from "@/app/data-entry/kpi-worker/resolveInputs";
import type { FormulaInput } from "@/db/schema/dataEntry";
import type { KpiWorkerScope } from "@/app/data-entry/kpi-worker/types";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface CalculatedKpi {
  kpi_def_id: number;
  kpi_name: string;
  formula: string;
  category: string;
  subcategory: string;
  unit: string | null;
  result: {
    value: string | null;
    status: "ok" | "error";
    failure_reason?: string;
  };
  variables: Record<string, number>;
  missing_variables: string[];
  target_value: string | null;
  scenario?: {
    value: string | null;
    status: "ok" | "error";
    failure_reason?: string;
    hypothetical_values: Record<string, number>;
  };
  sensitivity?: {
    variable: string;
    original: number;
    result: string | null;
    changes: Array<{ pct_change: number; new_value: number; kpi_result: string | null }>;
  };
}

export interface CalculatorData {
  kpis: CalculatedKpi[];
  report_period: {
    id: number;
    display: string;
    utility: string;
  } | null;
}

const resolvePeriod = async (
  user: CurrentUser,
  options: { report_period_id?: number | null; year?: number | null },
) => {
  if (options.report_period_id) {
    const [period] = await db
      .select({
        id: reportPeriods.id,
        display: reportPeriods.report_date,
        utility: organisations.acronym,
        utilityId: reportPeriods.utility_id,
      })
      .from(reportPeriods)
      .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
      .where(eq(reportPeriods.id, options.report_period_id))
      .limit(1);
    return period ?? null;
  }

  const predicates = [];
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    predicates.push(eq(reportPeriods.utility_id, user.org_id));
  }
  if (options.year) {
    predicates.push(
      sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${options.year}`,
    );
  }

  const [period] = await db
    .select({
      id: reportPeriods.id,
      display: reportPeriods.report_date,
      utility: organisations.acronym,
      utilityId: reportPeriods.utility_id,
    })
    .from(reportPeriods)
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(desc(reportPeriods.report_date))
    .limit(1);

  return period ?? null;
};

const formatPeriodDisplay = (date: Date): string => {
  const d = new Date(date);
  return `${d.getFullYear()}`;
};

export const calculateKpis = async (
  user: CurrentUser,
  options: {
    kpi_names?: string[];
    kpi_def_ids?: number[];
    category?: string;
    report_period_id?: number | null;
    year?: number | null;
    hypothetical_values?: Record<string, number>;
    sensitivity_variable?: string;
  } = {},
): Promise<AiToolResult<CalculatorData>> => {
  const period = await resolvePeriod(user, options);

  if (!period) {
    return {
      data: { kpis: [], report_period: null },
      metadata: createToolMetadata({ completeness_pct: 0, source: "kpi_worker" }),
      error: options.year
        ? `No report period found for year ${options.year}`
        : "No report period found",
    };
  }

  const scope: KpiWorkerScope = {
    reportPeriodId: period.id,
    organizationId: period.utilityId,
    serviceAreaId: null,
    energyResourceId: null,
    energyProviderId: null,
    energyTypeId: null,
    energySourceId: null,
    customerTypeId: null,
    paymentModeId: null,
  };

  const defPredicates = [eq(kpiDefinitions.is_active, true)];

  if (options.kpi_def_ids?.length) {
    const ids = options.kpi_def_ids;
    defPredicates.push(inArray(kpiDefinitions.id, ids));
  } else if (options.kpi_names?.length) {
    const nameConditions = options.kpi_names.map((name) =>
      like(kpiDefinitions.name, `%${name}%`),
    );
    if (nameConditions.length === 1) {
      defPredicates.push(nameConditions[0]);
    } else {
      const combined = or(...nameConditions);
      if (combined) defPredicates.push(combined);
    }
  }

  const defs = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      formula: kpiDefinitions.formula,
      formulaInputs: kpiDefinitions.formula_inputs,
      aggLevelId: kpiDefinitions.agg_level_id,
      targetValue: kpiDefinitions.targets,
      limits: kpiDefinitions.limits,
    })
    .from(kpiDefinitions)
    .where(and(...defPredicates))
    .limit(options.kpi_names || options.kpi_def_ids ? 10 : 20);

  if (defs.length === 0) {
    return {
      data: {
        kpis: [],
        report_period: {
          id: period.id,
          display: formatPeriodDisplay(period.display),
          utility: period.utility ?? "N/A",
        },
      },
      metadata: createToolMetadata({ completeness_pct: 0, source: "kpi_worker" }),
      error: "No matching KPI definitions found",
    };
  }

  const calculated: CalculatedKpi[] = [];

  for (const def of defs) {
    const formulaInputs = (def.formulaInputs ?? []) as FormulaInput[];
    let variables: Record<string, number> = {};
    let missingVariables: string[] = [];
    let scenario: CalculatedKpi["scenario"] = undefined;
    let sensitivity: CalculatedKpi["sensitivity"] = undefined;
    let result: CalculatedKpi["result"] = {
      value: null,
      status: "error",
      failure_reason: "No formula defined",
    };

    if (def.formula && formulaInputs.length > 0) {
      try {
        const resolved = await resolveFormulaInputValues({
          formulaInputs,
          kpiAggLevelId: def.aggLevelId,
          scope,
        });
        variables = resolved.variables;
        missingVariables = resolved.missingVariables;

        const evaluation = evaluateKpiFormula(def.formula, variables);
        result = {
          value: evaluation.value ?? null,
          status: evaluation.status,
          failure_reason: evaluation.failureReason,
        };

        // Scenario / what-if analysis
        if (options.hypothetical_values && Object.keys(options.hypothetical_values).length > 0) {
          const scenarioVars = { ...variables, ...options.hypothetical_values };
          const scenarioEval = evaluateKpiFormula(def.formula, scenarioVars);
          scenario = {
            value: scenarioEval.value ?? null,
            status: scenarioEval.status,
            failure_reason: scenarioEval.failureReason,
            hypothetical_values: options.hypothetical_values,
          };
        }

        // Sensitivity analysis
        if (options.sensitivity_variable && variables[options.sensitivity_variable] != null) {
          const origValue = variables[options.sensitivity_variable];
          const pcts = [-50, -25, -10, 10, 25, 50];
          const changes = pcts.map((pct) => {
            const newVal = origValue * (1 + pct / 100);
            const testVars = { ...variables, [options.sensitivity_variable!]: newVal };
            const evaled = evaluateKpiFormula(def.formula!, testVars);
            return {
              pct_change: pct,
              new_value: Math.round(newVal * 100) / 100,
              kpi_result: evaled.value ?? null,
            };
          });
          sensitivity = {
            variable: options.sensitivity_variable,
            original: origValue,
            result: result.value,
            changes,
          };
        }
      } catch (err) {
        result = {
          value: null,
          status: "error",
          failure_reason: err instanceof Error ? err.message : "Resolution failed",
        };
      }
    }

    let targetValue: string | null = null;
    if (def.targetValue && Array.isArray(def.targetValue)) {
      const match = (def.targetValue as Array<{ year?: number; target_value: string }>).find(
        (t) => t.year === options.year,
      );
      if (match) targetValue = match.target_value;
    }

    calculated.push({
      kpi_def_id: def.id,
      kpi_name: def.name,
      formula: def.formula ?? "",
      category: "",
      subcategory: "",
      unit: null,
      result,
      variables,
      missing_variables: missingVariables,
      target_value: targetValue,
      scenario,
      sensitivity,
    });
  }

  return {
    data: {
      kpis: calculated,
      report_period: {
        id: period.id,
        display: formatPeriodDisplay(period.display),
        utility: period.utility ?? "N/A",
      },
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: calculated.filter((c) => c.result.status === "ok").length / Math.max(calculated.length, 1) * 100,
      source: "kpi_worker",
    }),
  };
};
