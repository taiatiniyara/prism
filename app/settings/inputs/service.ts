"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  FormulaInput,
  InputDefinition,
  inputDefinitions,
  NewInputDefinition,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { createVariableName } from "@/lib/formatters";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { GetAllManagedListItems } from "../managed-lists/service";

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

export async function GetAllInputDefinitions(): Promise<InputDefinition[]> {
  const ml = await GetAllManagedListItems();
  const list = await db
    .select()
    .from(inputDefinitions)
    .orderBy(inputDefinitions.name);
  const returnList: InputDefinition[] = list.map((item) => ({
    ...item,
    category: ml.find((m) => m.id === item.category_id)?.name || "Unknown",
    data_type: ml.find((m) => m.id === item.data_type_id)?.name || "Unknown",
    subcategory:
      ml.find((m) => m.id === item.subcategory_id)?.name || "Unknown",
    unit: ml.find((m) => m.id === item.unit_id)?.name || "Unknown",
  }));
  return returnList;
}

export async function CreateInputDefinition(
  data: NewInputDefinition,
): Promise<DataTableFormResponse<InputDefinition>> {
  const [result] = await db
    .insert(inputDefinitions)
    .values({
      ...data,
      is_active: true,
    })
    .returning();
  return {
    success: true,
    message: "Input definition created successfully",
    data: result,
  };
}

interface ExcelInputDefinition {
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
      unit:
        managedListsItems.find((managedItem) => managedItem.id === item.unitId)
          ?.name || null,
      formula: item.formula,
      formula_inputs: item.formula_inputs,
      is_active: item.is_active,
    })),
    energyProviderOptions: energyProviderRows,
    energyTypeOptions: energyTypeRows,
    energySourceOptions: energySourceRows,
    previewContextLabel: "Preview uses dummy values.",
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
