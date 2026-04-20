"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  FormulaInput,
  InputDefinition,
  InputDefinitionAlternativeNames,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { createVariableName } from "@/lib/formatters";
import { and, asc, eq, ilike, or } from "drizzle-orm";
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
