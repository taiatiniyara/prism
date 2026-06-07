"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  FormulaInput,
  InputDefinition,
  InputDefinitionAlternativeNames,
  inputDlDefMappings,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { createVariableName } from "@/lib/formatters";
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { GetAllManagedListItems } from "../managed-lists/service";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";

export interface InputFormulaOption {
  id: number;
  name: string;
  description: string | null;
  variable_name: string | null;
  unit: string | null;
  formula: string | null;
  formula_inputs: FormulaInput[] | null;
  is_active: boolean;
}

export interface ManagedDimensionOption {
  id: number;
  name: string;
}

export interface InputFormulaBuilderData {
  inputs: InputFormulaOption[];
  energyProviderOptions: ManagedDimensionOption[];
  energyTypeOptions: ManagedDimensionOption[];
  energySourceOptions: ManagedDimensionOption[];
  previewContextLabel: string | null;
}

export interface SaveInputFormulaPayload {
  inputId: number;
  formula: string;
  formulaInputs: FormulaInput[];
}

interface CreateInputDefinitionPayload {
  name: string;
  sort_order?: string | number | null;
  description?: string | null;
  alternative_names?: InputDefinitionAlternativeNames | string | null;
  data_type_id: string | number;
  category_id: string | number;
  subcategory_id: string | number;
  unit_id: string | number;
  utility_service_id: number | null;
}

interface UpdateInputDefinitionPayload {
  id: string | number;
  name?: string;
  sort_order?: string | number;
  description?: string | null;
  alternative_names?: InputDefinitionAlternativeNames | string | null;
  data_type_id?: string | number;
  category_id?: string | number;
  subcategory_id?: string | number;
  unit_id?: string | number;
  utility_service_id?: number | null;
  is_active?: boolean;
}

const parseAlternativeNames = (
  raw: InputDefinitionAlternativeNames | string | null | undefined,
): InputDefinitionAlternativeNames | null => {
  if (raw == null) {
    return null;
  }

  if (typeof raw === "object") {
    const normalizedEntries = Object.entries(raw)
      .map(([key, value]) => [key.trim(), value] as const)
      .filter(([key]) => key.length > 0)
      .map(([key, value]) => {
        if (typeof value !== "string") {
          throw new Error("Alternative names values must be strings.");
        }

        const normalizedValue = value.trim();
        if (!normalizedValue) {
          throw new Error("Alternative names values cannot be empty strings.");
        }

        return [key, normalizedValue] as const;
      });

    if (normalizedEntries.length === 0) {
      return null;
    }

    return Object.fromEntries(normalizedEntries);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Alternative names must be valid JSON, e.g. {"41":"Solar output"}.',
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Alternative names must be a JSON object.");
  }

  const normalizedEntries = Object.entries(parsed)
    .map(([key, value]) => [key.trim(), value] as const)
    .filter(([key]) => key.length > 0)
    .map(([key, value]) => {
      if (typeof value !== "string") {
        throw new Error("Alternative names values must be strings.");
      }

      const normalizedValue = value.trim();
      if (!normalizedValue) {
        throw new Error("Alternative names values cannot be empty strings.");
      }

      return [key, normalizedValue] as const;
    });

  if (normalizedEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(normalizedEntries);
};

export async function GetAllInputDefinitions(): Promise<InputDefinition[]> {
  const ml = await GetAllManagedListItems();
  const managedListNamesById = buildManagedListNameMap(ml);
  const list = await db
    .select()
    .from(inputDefinitions)
    .orderBy(inputDefinitions.name);
  const returnList: InputDefinition[] = list.map((item) => ({
    ...item,
    category:
      resolveManagedListName(managedListNamesById, item.category_id, null) ||
      "Unknown",
    data_type:
      resolveManagedListName(managedListNamesById, item.data_type_id, null) ||
      "Unknown",
    subcategory:
      resolveManagedListName(managedListNamesById, item.subcategory_id, null) ||
      "Unknown",
    unit:
      resolveManagedListName(managedListNamesById, item.unit_id, null) ||
      "Unknown",
  }));
  return returnList;
}

export async function CreateInputDefinition(
  data: CreateInputDefinitionPayload,
): Promise<DataTableFormResponse<InputDefinition>> {
  const name = data.name?.trim();
  if (!name) {
    return {
      success: false,
      message: "Input name is required",
    };
  }

  const toNumber = (value: string | number) => Number(value);
  let alternativeNames: InputDefinitionAlternativeNames | null = null;

  try {
    alternativeNames = parseAlternativeNames(data.alternative_names);
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    };
  }

  const payload = {
    name,
    sort_order:
      data.sort_order == null || data.sort_order === ""
        ? 0
        : Number(data.sort_order),
    description: data.description?.trim() || null,
    variable_name: createVariableName(name),
    alternative_names: alternativeNames,
    data_type_id: toNumber(data.data_type_id),
    category_id: toNumber(data.category_id),
    subcategory_id: toNumber(data.subcategory_id),
    unit_id: toNumber(data.unit_id),
    utility_service_id: null,
    is_active: true,
  };

  const hasInvalidId = [
    payload.sort_order,
    payload.data_type_id,
    payload.category_id,
    payload.subcategory_id,
    payload.unit_id,
  ].some((id) => Number.isNaN(id));

  if (hasInvalidId) {
    return {
      success: false,
      message: "Please select valid managed-list values before submitting.",
    };
  }

  const existing = await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(ilike(inputDefinitions.name, name))
    .limit(1);

  if (existing.length > 0) {
    return {
      success: false,
      message: "An input definition with this name already exists.",
    };
  }

  const [result] = await db
    .insert(inputDefinitions)
    .values(payload)
    .returning();

  revalidatePath("/settings/inputs");

  return {
    success: true,
    message: "Input definition created successfully",
    data: result,
  };
}

export async function UpdateInputDefinition(
  data: Partial<UpdateInputDefinitionPayload>,
): Promise<DataTableFormResponse<InputDefinition>> {
  const id = Number(data.id);
  if (Number.isNaN(id)) {
    return {
      success: false,
      message: "Invalid input definition id.",
    };
  }

  const patch: Partial<InputDefinition> = {};

  if (typeof data.name === "string") {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      return {
        success: false,
        message: "Input name is required.",
      };
    }

    const duplicate = await db
      .select({ id: inputDefinitions.id })
      .from(inputDefinitions)
      .where(ilike(inputDefinitions.name, trimmedName));

    if (duplicate.some((item) => item.id !== id)) {
      return {
        success: false,
        message: "An input definition with this name already exists.",
      };
    }

    patch.name = trimmedName;
    patch.variable_name = createVariableName(trimmedName);
  }

  if (typeof data.description === "string") {
    patch.description = data.description.trim() || null;
  }

  if (data.alternative_names !== undefined) {
    try {
      patch.alternative_names = parseAlternativeNames(data.alternative_names);
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  const assignNumericField = (
    key: keyof Pick<
      UpdateInputDefinitionPayload,
      | "data_type_id"
      | "category_id"
      | "subcategory_id"
      | "unit_id"
      | "utility_service_id"
      | "sort_order"
    >,
  ) => {
    if (data[key] == null || data[key] === "") {
      return;
    }
    const value = Number(data[key]);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid value for ${String(key)}`);
    }
    patch[key] = value;
  };

  try {
    assignNumericField("sort_order");
    assignNumericField("data_type_id");
    assignNumericField("category_id");
    assignNumericField("subcategory_id");
    assignNumericField("unit_id");
    assignNumericField("utility_service_id");
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    };
  }

  if (typeof data.is_active === "boolean") {
    patch.is_active = data.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return {
      success: false,
      message: "No valid fields provided for update.",
    };
  }

  const [result] = await db
    .update(inputDefinitions)
    .set(patch)
    .where(eq(inputDefinitions.id, id))
    .returning();

  revalidatePath("/settings/inputs");

  return {
    success: true,
    message: "Input definition updated successfully",
    data: result,
  };
}

export interface ExcelInputDefinition {
  agg_level_id: number;
  data_type_id: number;
  description: string;
  input_category_id: number;
  input_id: number;
  input_subcategory_id: number;
  is_active: boolean;
  is_aggregated: boolean;
  is_calculated: boolean;
  is_currency: boolean;
  is_descriptive: boolean;
  is_kpi: boolean;
  is_kpi_input: boolean;
  is_mandatory: boolean;
  is_system_generated: boolean;
  name: string;
  service_relevance_group_id: number;
  unit_id: number;
  utility_service_id: number;
  valid_polarity_id: number;
  valid_range_max: number;
  valid_range_min: number;
  valid_trend_id: number;
  variable_name: string;
}

export async function UpdateInputDefinitionFromExcel(
  data: ExcelInputDefinition[],
) {
  const existing = await db.select().from(inputDefinitions);
  const filteredExisting = data.filter(
    (item) =>
      !existing.some(
        (e) =>
          e.id === item.input_id ||
          e.name.toLowerCase() === item.name.toLowerCase(),
      ),
  );
  const createList: InputDefinition[] = filteredExisting.map((item) => ({
    id: item.input_id,
    name: item.name,
    sort_order: 0,
    description: item.description,
    alternative_names: null,
    data_type_id: item.data_type_id,
    category_id: item.input_category_id,
    subcategory_id: item.input_subcategory_id,
    agg_level_id: item.agg_level_id,
    is_active: item.is_active,
    is_aggregated: item.is_aggregated,
    is_calculated: item.is_calculated,
    is_currency: item.is_currency,
    is_descriptive: item.is_descriptive,
    is_kpi: item.is_kpi,
    is_kpi_input: item.is_kpi_input,
    is_mandatory: item.is_mandatory,
    is_system_generated: item.is_system_generated,
    service_relevance_group_id: item.service_relevance_group_id,
    unit_id: item.unit_id,
    utility_service_id: item.utility_service_id,
    valid_polarity_id: item.valid_polarity_id,
    valid_range_max: item.valid_range_max,
    valid_range_min: item.valid_range_min,
    valid_trend_id: item.valid_trend_id,
    variable_name: createVariableName(item.name),
    formula: null,
    formula_inputs: null,
    updated_at: new Date(),
  }));
  if (createList.length > 0) {
    try {
      await db.insert(inputDefinitions).values(createList);
    } catch (error) {
      console.error("Error inserting input definitions from Excel:", error);
      throw new Error("Failed to insert input definitions from Excel");
    }
  }

  revalidatePath("/settings/inputs");
}

export async function GetInputFormulaBuilderData(): Promise<InputFormulaBuilderData> {
  const managedListsItems = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(managedListsItems);

  const inputs = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      description: inputDefinitions.description,
      variable_name: inputDefinitions.variable_name,
      unitId: inputDefinitions.unit_id,
      formula: inputDefinitions.formula,
      formula_inputs: inputDefinitions.formula_inputs,
      is_active: inputDefinitions.is_active,
    })
    .from(inputDefinitions)
    .orderBy(asc(inputDefinitions.name));

  const energyProviderRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        or(
          ilike(managedLists.name, "%energy provider%"),
          ilike(managedLists.name, "%energy providers%"),
        ),
      ),
    )
    .orderBy(asc(managedListItems.name));

  const energySourceRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        or(
          ilike(managedLists.name, "%energy source%"),
          ilike(managedLists.name, "%energy sources%"),
        ),
      ),
    )
    .orderBy(asc(managedListItems.name));

  const energyTypeRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        or(
          ilike(managedLists.name, "%energy type%"),
          ilike(managedLists.name, "%energy types%"),
        ),
      ),
    )
    .orderBy(asc(managedListItems.name));

  return {
    inputs: inputs.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      variable_name: item.variable_name,
      unit: resolveManagedListName(managedListNamesById, item.unitId, null),
      formula: item.formula,
      formula_inputs: item.formula_inputs,
      is_active: item.is_active,
    })),
    energyProviderOptions: energyProviderRows,
    energyTypeOptions: energyTypeRows,
    energySourceOptions: energySourceRows,
    previewContextLabel: "Preview uses sample values.",
  };
}

export async function SaveInputFormula(payload: SaveInputFormulaPayload) {
  const formula = payload.formula.trim();

  if (!payload.inputId || Number.isNaN(payload.inputId)) {
    return {
      success: false,
      message: "Please choose an input definition first.",
    };
  }
  if (!formula) {
    return { success: false, message: "Formula is required." };
  }

  const containsSelfReference = payload.formulaInputs.some(
    (item) => item.input_def_id === payload.inputId,
  );
  if (containsSelfReference) {
    return {
      success: false,
      message: "An input formula cannot reference itself.",
    };
  }

  try {
    await db
      .update(inputDefinitions)
      .set({
        formula,
        formula_inputs: payload.formulaInputs,
        is_calculated: true,
      })
      .where(eq(inputDefinitions.id, payload.inputId));
  } catch (error) {
    console.error("Failed to save input formula:", error);
    return {
      success: false,
      message:
        "Unable to save formula. It may exceed current database limits. Please shorten it and try again.",
    };
  }

  revalidatePath("/settings/inputs");
  return { success: true, message: "Input formula saved successfully." };
}

export async function getInputsBySubcategory(
  subcategoryId: number,
): Promise<InputDefinition[]> {
  const inputs = await db
    .select()
    .from(inputDefinitions)
    .where(eq(inputDefinitions.subcategory_id, subcategoryId));
  return inputs;
}

export interface TrainingDataLabelDefinition {
  id: number;
  legacy_id: string;
  source_id: number | null;
  name: string;
  variable_name: string | null;
  category_id: number;
  category_name: string | null;
  subcategory_id: number;
  subcategory_name: string | null;
  unit_id: number;
  unit_name: string | null;
  data_type_id: number;
  data_type_name: string | null;
  agg_level_id: number;
  is_active: boolean;
  is_aggregated: boolean;
}

export interface InputDlMapCandidate {
  trainingDlDefId: number;
  trainingDlLegacyId: string;
  trainingSourceId: number | null;
  trainingName: string;
  trainingVariableName: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export interface InputDlMapRow {
  inputId: number;
  inputName: string;
  inputVariableName: string | null;
  savedTrainingDlDefId: number | null;
  savedConfidence: string | null;
  bestCandidate: InputDlMapCandidate | null;
  alternatives: InputDlMapCandidate[];
}

export interface InputDlMapBuilderResult {
  rows: InputDlMapRow[];
  trainingDataLabels: TrainingDataLabelDefinition[];
  persistedMappings: {
    trainingDlDefId: number;
    inputId: number;
    inputName: string;
  }[];
  stats: {
    inputsTotal: number;
    trainingDlDefsTotal: number;
    mappedHigh: number;
    mappedMedium: number;
    mappedLow: number;
    unmapped: number;
  };
  source: {
    baseUrl: string;
    endpoint: string;
    error?: string;
  };
}

interface TrainingDlDefEndpointResponse {
  data: TrainingDataLabelDefinition[];
  pagination?: {
    nextCursor: number | null;
    hasMore: boolean;
    returned: number;
  };
}

export interface SaveInputDlMappingItem {
  inputId: number;
  candidate: InputDlMapCandidate | null;
}

export interface SaveInputDlMappingsPayload {
  items: SaveInputDlMappingItem[];
}

interface SavedInputDlMapping {
  inputDefId: number;
  trainingDlDefId: number;
  trainingDlLegacyId: string;
  trainingSourceId: number | null;
  trainingDlName: string;
  trainingVariableName: string | null;
  score: number;
  confidence: string;
  reasons: string[];
}

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const confidenceFromScore = (
  score: number,
): InputDlMapCandidate["confidence"] => {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
};

function scoreMapping(
  input: InputDefinition,
  training: TrainingDataLabelDefinition,
): InputDlMapCandidate {
  const reasons: string[] = [];
  let score = 0;

  const inputVarNorm = normalize(input.variable_name).replace(/[_\s-]+/g, "");
  const trainingVarNorm = normalize(training.variable_name).replace(
    /[_\s-]+/g,
    "",
  );

  if (
    input.variable_name &&
    training.variable_name &&
    inputVarNorm === trainingVarNorm
  ) {
    score += 60;
    reasons.push("variable_name match");
  } else if (
    inputVarNorm &&
    trainingVarNorm &&
    (inputVarNorm.includes(trainingVarNorm) ||
      trainingVarNorm.includes(inputVarNorm))
  ) {
    score += 35;
    reasons.push("partial variable_name match");
  }

  const inputNameNorm = normalize(input.name);
  const trainingNameNorm = normalize(training.name);

  if (inputNameNorm === trainingNameNorm) {
    score += 30;
    reasons.push("name match");
  } else {
    const inputWords = new Set(
      inputNameNorm.split(/\s+/).filter((w) => w.length > 1),
    );
    const trainingWords = new Set(
      trainingNameNorm.split(/\s+/).filter((w) => w.length > 1),
    );

    if (inputWords.size > 0 && trainingWords.size > 0) {
      const intersection = [...inputWords].filter((w) =>
        trainingWords.has(w),
      );
      const union = new Set([...inputWords, ...trainingWords]);
      const jaccard = intersection.length / union.size;

      if (jaccard >= 0.8) {
        score += 20;
        reasons.push("strong word overlap");
      } else if (jaccard >= 0.5) {
        score += 12;
        reasons.push("moderate word overlap");
      } else if (
        inputNameNorm.includes(trainingNameNorm) ||
        trainingNameNorm.includes(inputNameNorm)
      ) {
        score += 8;
        reasons.push("substring match");
      }
    }
  }

  if (input.category_id === training.category_id) {
    score += 10;
    reasons.push("category match");
  }
  if (input.subcategory_id === training.subcategory_id) {
    score += 10;
    reasons.push("subcategory match");
  }
  if (input.unit_id === training.unit_id) {
    score += 5;
    reasons.push("unit match");
  }
  if (input.data_type_id === training.data_type_id) {
    score += 5;
    reasons.push("data_type match");
  }

  if (
    input.agg_level_id != null &&
    training.agg_level_id != null &&
    input.agg_level_id === training.agg_level_id
  ) {
    score += 5;
    reasons.push("agg_level match");
  }

  return {
    trainingDlDefId: training.id,
    trainingDlLegacyId: training.legacy_id,
    trainingSourceId: training.source_id,
    trainingName: training.name,
    trainingVariableName: training.variable_name,
    score,
    confidence: confidenceFromScore(score),
    reasons,
  };
}

async function fetchTrainingDataLabelDefinitions() {
  const baseUrl = process.env.PRISM_TRAINING_API_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error(
      "PRISM_TRAINING_API_BASE_URL is not configured in prism environment.",
    );
  }

  const endpoint = baseUrl.endsWith("/api")
    ? `${baseUrl}/migration/dlDef`
    : `${baseUrl}/api/migration/dlDef`;
  const migrationKey = process.env.PRISM_TRAINING_MIGRATION_KEY;

  let cursor: number | null = null;
  const all: TrainingDataLabelDefinition[] = [];

  while (true) {
    const params = new URLSearchParams({
      limit: "2000",
      includeAggregated: "false",
      includeInactive: "false",
    });
    if (cursor != null) {
      params.set("cursor", String(cursor));
    }

    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: migrationKey
        ? {
            "x-migration-key": migrationKey,
          }
        : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Failed pulling data-label-definitions (${response.status}).`,
      );
    }

    const payload =
      (await response.json()) as Partial<TrainingDlDefEndpointResponse>;
    const rows = Array.isArray(payload.data) ? payload.data : [];
    all.push(...rows);

    const hasMore = Boolean(payload.pagination?.hasMore);
    cursor = payload.pagination?.nextCursor ?? null;
    if (!hasMore || cursor == null) {
      break;
    }
  }

  return {
    baseUrl,
    endpoint,
    data: all,
  };
}

async function fetchSavedInputDlMappings(): Promise<SavedInputDlMapping[]> {
  try {
    const rows = await db.select().from(inputDlDefMappings);
    return rows.map((row) => ({
      inputDefId: row.input_def_id,
      trainingDlDefId: row.training_dl_def_id,
      trainingDlLegacyId: row.training_dl_legacy_id,
      trainingSourceId: row.training_source_id,
      trainingDlName: row.training_dl_name,
      trainingVariableName: row.training_variable_name,
      score: row.score,
      confidence: row.confidence,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("input_dl_def_mappings") ||
      message.includes("does not exist")
    ) {
      // Allow preview mode before DB migration creates the mappings table.
      return [];
    }
    throw error;
  }
}

export async function BuildInputDlMappingCandidates(): Promise<InputDlMapBuilderResult> {
  const [inputs, savedMappings] = await Promise.all([
    db.select().from(inputDefinitions).orderBy(asc(inputDefinitions.id)),
    fetchSavedInputDlMappings(),
  ]);

  let training: {
    baseUrl: string;
    endpoint: string;
    data: TrainingDataLabelDefinition[];
    error?: string;
  };

  try {
    training = await fetchTrainingDataLabelDefinitions();
  } catch (error) {
    console.error("[map-builder] failed to fetch training data labels:", error);
    const baseUrl = process.env.PRISM_TRAINING_API_BASE_URL ?? "";
    const endpoint = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/api/migration/dlDef`
      : "PRISM_TRAINING_API_BASE_URL not configured";

    training = {
      baseUrl,
      endpoint,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error fetching training labels",
    };
  }

  const trainingById = new Map(training.data.map((dl) => [dl.id, dl]));
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  const savedByInputId = new Map(savedMappings.map((m) => [m.inputDefId, m]));

  const persistedMappings = savedMappings
    .map((mapping) => {
      const input = inputById.get(mapping.inputDefId);
      if (!input) {
        return null;
      }

      return {
        trainingDlDefId: mapping.trainingDlDefId,
        inputId: mapping.inputDefId,
        inputName: input.name,
      };
    })
    .filter(
      (
        row,
      ): row is {
        trainingDlDefId: number;
        inputId: number;
        inputName: string;
      } => row !== null,
    );

  const rows: InputDlMapRow[] = inputs.map((input) => {
    const ranked = training.data
      .map((dl) => scoreMapping(input, dl))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const saved = savedByInputId.get(input.id);
    if (
      saved &&
      !ranked.some((r) => r.trainingDlDefId === saved.trainingDlDefId)
    ) {
      const trainingRow = trainingById.get(saved.trainingDlDefId);
      if (trainingRow) {
        ranked.push(scoreMapping(input, trainingRow));
      } else {
        ranked.push({
          trainingDlDefId: saved.trainingDlDefId,
          trainingDlLegacyId: saved.trainingDlLegacyId,
          trainingSourceId: saved.trainingSourceId,
          trainingName: saved.trainingDlName,
          trainingVariableName: saved.trainingVariableName,
          score: saved.score,
          confidence:
            saved.confidence === "high" ||
            saved.confidence === "medium" ||
            saved.confidence === "low"
              ? saved.confidence
              : "low",
          reasons: saved.reasons,
        });
      }
    }

    ranked.sort((a, b) => b.score - a.score);

    return {
      inputId: input.id,
      inputName: input.name,
      inputVariableName: input.variable_name,
      savedTrainingDlDefId: saved?.trainingDlDefId ?? null,
      savedConfidence: saved?.confidence ?? null,
      bestCandidate: ranked[0] ?? null,
      alternatives: ranked.slice(1),
    };
  });

  const stats = rows.reduce(
    (acc, row) => {
      if (!row.bestCandidate) {
        acc.unmapped += 1;
      } else if (row.bestCandidate.confidence === "high") {
        acc.mappedHigh += 1;
      } else if (row.bestCandidate.confidence === "medium") {
        acc.mappedMedium += 1;
      } else {
        acc.mappedLow += 1;
      }
      return acc;
    },
    {
      inputsTotal: rows.length,
      trainingDlDefsTotal: training.data.length,
      mappedHigh: 0,
      mappedMedium: 0,
      mappedLow: 0,
      unmapped: 0,
    },
  );

  return {
    rows,
    trainingDataLabels: training.data,
    persistedMappings,
    stats,
    source: {
      baseUrl: training.baseUrl,
      endpoint: training.endpoint,
      error: training.error,
    },
  };
}

export async function SaveInputDlMappings(
  payload: SaveInputDlMappingsPayload,
): Promise<{ success: boolean; message: string; savedCount: number }> {
  const items = payload.items.filter((item) => item.candidate !== null);

  if (items.length === 0) {
    return {
      success: false,
      message: "No mappings selected to save.",
      savedCount: 0,
    };
  }

  const inputIds = items.map((item) => item.inputId);
  const existingInputs = await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(inArray(inputDefinitions.id, inputIds));

  const existingSet = new Set(existingInputs.map((item) => item.id));
  const validItems = items.filter((item) => existingSet.has(item.inputId));

  if (validItems.length === 0) {
    return {
      success: false,
      message: "Selected mappings reference missing inputs.",
      savedCount: 0,
    };
  }

  const training = await fetchTrainingDataLabelDefinitions();
  const trainingBySuffix = new Map<string, TrainingDataLabelDefinition[]>();
  for (const dl of training.data) {
    const suffix = dl.id.toString().slice(-3).padStart(3, "0");
    const existing = trainingBySuffix.get(suffix) ?? [];
    existing.push(dl);
    trainingBySuffix.set(suffix, existing);
  }

  const now = new Date();
  let insertedCount = 0;

  await db.transaction(async (tx) => {
    for (const item of validItems) {
      const candidate = item.candidate!;
      const suffix = candidate.trainingDlDefId
        .toString()
        .slice(-3)
        .padStart(3, "0");
      const matchedBySuffix = trainingBySuffix.get(suffix) ?? [];

      const mappedCandidates: InputDlMapCandidate[] =
        matchedBySuffix.length > 0
          ? matchedBySuffix.map((dl) => ({
              trainingDlDefId: dl.id,
              trainingDlLegacyId: dl.legacy_id,
              trainingSourceId: dl.source_id,
              trainingName: dl.name,
              trainingVariableName: dl.variable_name,
              score: candidate.score,
              confidence: candidate.confidence,
              reasons: [...candidate.reasons, `same id suffix (${suffix})`],
            }))
          : [candidate];

      for (const mapped of mappedCandidates) {
        const inserted = await tx
          .insert(inputDlDefMappings)
          .values({
            input_def_id: item.inputId,
            training_dl_def_id: mapped.trainingDlDefId,
            training_dl_legacy_id: mapped.trainingDlLegacyId,
            training_source_id: mapped.trainingSourceId,
            training_dl_name: mapped.trainingName,
            training_variable_name: mapped.trainingVariableName,
            score: mapped.score,
            confidence: mapped.confidence,
            reasons: mapped.reasons,
            is_auto: false,
            is_approved: true,
            approved_at: now,
            updated_at: now,
          })
          .onConflictDoNothing({
            target: [
              inputDlDefMappings.input_def_id,
              inputDlDefMappings.training_dl_def_id,
            ],
          })
          .returning({ id: inputDlDefMappings.id });

        insertedCount += inserted.length;
      }
    }
  });

  revalidatePath("/settings/inputs");

  return {
    success: true,
    message: `Saved ${insertedCount} mappings across ${validItems.length} input(s).`,
    savedCount: insertedCount,
  };
}

export async function AutoAcceptHighInputDlMappings(): Promise<{
  success: boolean;
  message: string;
  savedCount: number;
}> {
  const result = await BuildInputDlMappingCandidates();

  const highItems: SaveInputDlMappingItem[] = result.rows
    .filter(
      (row) =>
        row.bestCandidate?.confidence === "high" && row.bestCandidate !== null,
    )
    .map((row) => ({
      inputId: row.inputId,
      candidate: row.bestCandidate,
    }));

  if (highItems.length === 0) {
    return {
      success: true,
      message: "No high-confidence mappings to auto-accept.",
      savedCount: 0,
    };
  }

  const now = new Date();
  let insertedCount = 0;
  await db.transaction(async (tx) => {
    for (const item of highItems) {
      const candidate = item.candidate!;

      const inserted = await tx
        .insert(inputDlDefMappings)
        .values({
          input_def_id: item.inputId,
          training_dl_def_id: candidate.trainingDlDefId,
          training_dl_legacy_id: candidate.trainingDlLegacyId,
          training_source_id: candidate.trainingSourceId,
          training_dl_name: candidate.trainingName,
          training_variable_name: candidate.trainingVariableName,
          score: candidate.score,
          confidence: candidate.confidence,
          reasons: candidate.reasons,
          is_auto: true,
          is_approved: true,
          approved_at: now,
          updated_at: now,
        })
        .onConflictDoNothing({
          target: [
            inputDlDefMappings.input_def_id,
            inputDlDefMappings.training_dl_def_id,
          ],
        })
        .returning({ id: inputDlDefMappings.id });

      insertedCount += inserted.length;
    }
  });

  revalidatePath("/settings/inputs");

  return {
    success: true,
    message: `Auto-accepted ${insertedCount} high-confidence mappings.`,
    savedCount: insertedCount,
  };
}
