"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  InputDefinition,
  inputDefinitions,
  NewInputDefinition,
} from "@/db/schema/dataEntry";
import { createVariableName } from "@/lib/formatters";
import { revalidatePath } from "next/cache";
import { GetAllManagedListItems } from "../managed-lists/service";

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
