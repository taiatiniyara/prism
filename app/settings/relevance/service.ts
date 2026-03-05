"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  inputDefinitions,
  InputRelevance,
  inputRelevance,
} from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { generateRandomNumber } from "@/lib/utils";
import { eq } from "drizzle-orm";

export async function InputRelevanceList(): Promise<InputRelevance[]> {
  const list = await db
    .select()
    .from(inputRelevance)
    .leftJoin(
      inputDefinitions,
      eq(inputRelevance.input_def_id, inputDefinitions.id),
    )
    .leftJoin(
      managedListItems,
      eq(inputRelevance.dimension_id, managedListItems.id),
    )
    .orderBy(inputRelevance.input_def_id);

  return list.map((ir) => ({
    ...ir.input_relevance,
    dimension: ir.managed_list_items?.name || null,
    input_def: ir.input_definitions?.name || null,
  }));
}

export async function UpdateInputRelevance(
  data: Partial<InputRelevance>,
): Promise<DataTableFormResponse<InputRelevance>> {
  if (!data.id) {
    return {
      success: false,
      message: "ID is required",
    };
  }

  await db
    .update(inputRelevance)
    .set({
      is_relevant: data.is_relevant ?? true,
    })
    .where(eq(inputRelevance.id, data.id));

  return {
    success: true,
    message: "Input relevance updated successfully",
  };
}

export async function CreateInputRelevance(
  data: Partial<InputRelevance>,
): Promise<DataTableFormResponse<InputRelevance>> {
  if (!data.input_def_id || !data.dimension_id) {
    return {
      success: false,
      message: "Input Definition ID and Dimension ID are required",
    };
  }

  await db.insert(inputRelevance).values({
    id: generateRandomNumber(5),
    input_def_id: data.input_def_id,
    dimension_id: data.dimension_id,
    is_relevant: data.is_relevant ?? true,
  });

  return {
    success: true,
    message: "Input relevance created successfully",
  };
}
