import { db } from "@/db/connection";
import { kpiDefinitions } from "@/db/schema/kpi";
import { customKpiRequests } from "@/db/schema/custom-kpi-requests";
import { inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface KpiDefinition {
  id: number;
  name: string;
  description: string;
  definition: string | null;
  definition_status: "draft" | "curated" | null;
  synonyms: string[] | null;
  formula: string;
  formula_explanation: string;
  category: string;
  subcategory: string;
  unit: string;
  agg_level: string;
  category_description: string;
  benchmarking_type: string;
  limits: { min: number; max: number; unit: string } | null;
}

export const explainKpi = async (
  options: {
    kpi_name?: string;
    kpi_def_id?: number;
  } = {},
): Promise<AiToolResult<KpiDefinition | null>> => {
  if (!options.kpi_name && !options.kpi_def_id) {
    return {
      data: null,
      metadata: createToolMetadata({ source: "kpi_definitions" }),
      error: "No KPI name or ID specified",
    };
  }

  const predicates = [eq(kpiDefinitions.is_active, true)];

  if (options.kpi_def_id) {
    predicates.push(eq(kpiDefinitions.id, options.kpi_def_id));
  } else {
    const term = `%${options.kpi_name}%`;
    predicates.push(
      or(
        ilike(kpiDefinitions.name, term),
        sql`${kpiDefinitions.synonyms}::text ILIKE ${term}`,
      )!,
    );
  }

  const [def] = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      description: kpiDefinitions.description,
      definition: kpiDefinitions.definition,
      definitionStatus: kpiDefinitions.definition_status,
      synonyms: kpiDefinitions.synonyms,
      formula: kpiDefinitions.formula,
      categoryId: kpiDefinitions.category_id,
      subcategoryId: kpiDefinitions.subcategory_id,
      unitId: kpiDefinitions.unit_id,
      aggLevelId: kpiDefinitions.agg_level_id,
      targets: kpiDefinitions.targets,
      limits: kpiDefinitions.limits,
      type: kpiDefinitions.type,
    })
    .from(kpiDefinitions)
    .where(and(...predicates))
    .limit(1);

  if (!def) {
    return {
      data: null,
      metadata: createToolMetadata({ source: "kpi_definitions" }),
      error: `No KPI found matching "${options.kpi_name}"`,
    };
  }

  const ids = [
    ...new Set(
      [def.categoryId, def.subcategoryId, def.unitId, def.aggLevelId].filter(
        (id): id is number => id != null,
      ),
    ),
  ];

  const mliRows = ids.length > 0
    ? await db
        .select({ id: managedListItems.id, name: managedListItems.name })
        .from(managedListItems)
        .where(sql`${managedListItems.id} IN ${ids}`)
    : [];

  const nameMap = new Map(mliRows.map((r) => [r.id, r.name]));

  const limits = def.limits && Array.isArray(def.limits)
    ? (def.limits[0] as unknown as { lower?: number | null; upper?: number | null; unit?: string } | undefined)
    : null;

  return {
    data: {
      id: def.id,
      name: def.name,
      description: def.description ?? "",
      definition: def.definition,
      definition_status: def.definitionStatus,
      synonyms: def.synonyms,
      formula: def.formula ?? "No formula defined",
      formula_explanation: explainFormula(def.formula ?? "", def.name),
      category: nameMap.get(def.categoryId ?? -1) ?? "Unknown",
      subcategory: nameMap.get(def.subcategoryId ?? -1) ?? "Unknown",
      unit: nameMap.get(def.unitId ?? -1) ?? "",
      agg_level: nameMap.get(def.aggLevelId ?? -1) ?? "Unknown",
      category_description: `Part of the ${nameMap.get(def.categoryId ?? -1) ?? "Unknown"} category`,
      benchmarking_type: def.type ?? "benchmarking",
      limits: limits ? { min: limits.lower ?? 0, max: limits.upper ?? 0, unit: limits.unit ?? "" } : null,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_definitions" }),
  };
};

export interface InputDefinitionExplanation {
  id: number;
  name: string;
  variable_name: string | null;
  definition: string | null;
  definition_status: "draft" | "curated" | null;
  synonyms: string[] | null;
  category: string;
  subcategory: string;
  unit: string;
  is_calculated: boolean;
  is_mandatory: boolean;
  formula: string | null;
}

export const explainInput = async (
  options: {
    input_name?: string;
    input_def_id?: number;
  } = {},
): Promise<AiToolResult<InputDefinitionExplanation | null>> => {
  if (!options.input_name && !options.input_def_id) {
    return {
      data: null,
      metadata: createToolMetadata({ source: "input_definitions" }),
      error: "No input name or ID specified",
    };
  }

  const predicates = [eq(inputDefinitions.is_active, true)];

  if (options.input_def_id) {
    predicates.push(eq(inputDefinitions.id, options.input_def_id));
  } else {
    const term = `%${options.input_name}%`;
    predicates.push(
      or(
        ilike(inputDefinitions.name, term),
        ilike(inputDefinitions.variable_name, term),
        sql`${inputDefinitions.synonyms}::text ILIKE ${term}`,
      )!,
    );
  }

  const [def] = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variableName: inputDefinitions.variable_name,
      definition: inputDefinitions.definition,
      definitionStatus: inputDefinitions.definition_status,
      synonyms: inputDefinitions.synonyms,
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
      unitId: inputDefinitions.unit_id,
      isCalculated: inputDefinitions.is_calculated,
      isMandatory: inputDefinitions.is_mandatory,
      formula: inputDefinitions.formula,
    })
    .from(inputDefinitions)
    .where(and(...predicates))
    .limit(1);

  if (!def) {
    return {
      data: null,
      metadata: createToolMetadata({ source: "input_definitions" }),
      error: `No input definition found matching "${options.input_name}"`,
    };
  }

  const ids = [
    ...new Set(
      [def.categoryId, def.subcategoryId, def.unitId].filter(
        (id): id is number => id != null,
      ),
    ),
  ];

  const mliRows = ids.length > 0
    ? await db
        .select({ id: managedListItems.id, name: managedListItems.name })
        .from(managedListItems)
        .where(sql`${managedListItems.id} IN ${ids}`)
    : [];

  const nameMap = new Map(mliRows.map((r) => [r.id, r.name]));

  return {
    data: {
      id: def.id,
      name: def.name,
      variable_name: def.variableName,
      definition: def.definition,
      definition_status: def.definitionStatus,
      synonyms: def.synonyms,
      category: nameMap.get(def.categoryId ?? -1) ?? "Unknown",
      subcategory: nameMap.get(def.subcategoryId ?? -1) ?? "Unknown",
      unit: nameMap.get(def.unitId ?? -1) ?? "",
      is_calculated: def.isCalculated,
      is_mandatory: def.isMandatory,
      formula: def.formula,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "input_definitions" }),
  };
};

const explainFormula = (formula: string, kpiName: string): string => {
  if (!formula) return "No formula defined";
  const parts = formula.split(/[+\-*/()]/).filter((s) => s.trim());
  const vars = parts.map((p) => p.trim()).filter((p) => p && isNaN(Number(p)));
  if (vars.length === 0) return `${kpiName} is a manually entered value.`;
  return `${kpiName} is calculated as: ${formula}. It depends on: ${vars.join(", ")}.`;
};

export interface CustomKpiRequest {
  id: string;
  title: string;
  status: string;
  requested_by: string;
  requested_at: string;
  approved_kpi_def_id: number | null;
}

export interface CustomKpiStatusData {
  requests: CustomKpiRequest[];
  summary: { total: number; pending: number; approved: number; rejected: number };
}

export const getCustomKpiStatus = async (): Promise<AiToolResult<CustomKpiStatusData>> => {
  try {
    const rows = await db
      .select({
        id: customKpiRequests.id,
        title: customKpiRequests.title,
        status: customKpiRequests.status,
        submitter: customKpiRequests.submitter_user_id,
        created: customKpiRequests.created_at,
      })
      .from(customKpiRequests)
      .orderBy(desc(customKpiRequests.created_at))
      .limit(50);

    const requests: CustomKpiRequest[] = rows.map((r) => ({
      id: r.id,
      title: r.title ?? "Untitled",
      status: r.status ?? "UNKNOWN",
      requested_by: r.submitter ?? "Unknown",
      requested_at: r.created?.toISOString() ?? "",
      approved_kpi_def_id: null,
    }));

    const summary = {
      total: requests.length,
      pending: requests.filter((r) => r.status === "PENDING_REVIEW").length,
      approved: requests.filter((r) => r.status === "APPROVED").length,
      rejected: requests.filter((r) => r.status === "REJECTED" || r.status === "REPLACED").length,
    };

    return {
      data: { requests, summary },
      metadata: createToolMetadata({ source: "custom_kpi_requests", freshness: new Date() }),
    };
  } catch {
    return {
      data: { requests: [], summary: { total: 0, pending: 0, approved: 0, rejected: 0 } },
      metadata: createToolMetadata({ source: "custom_kpi_requests" }),
      error: "Custom KPI requests data is currently unavailable.",
    };
  }
};
