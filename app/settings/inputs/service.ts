import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  InputDefinition,
  inputDefinitions,
  NewInputDefinition,
} from "@/db/schema/dataEntry";
import { eq } from "drizzle-orm";

export async function GetAllInputDefinitions(): Promise<InputDefinition[]> {
  const list = await db
    .select()
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true))
    .orderBy(inputDefinitions.name);
  return list;
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
