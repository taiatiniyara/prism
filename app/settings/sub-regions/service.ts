"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { NewSubRegion, subRegions, SubRegion } from "@/db/schema/country";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function AllSubRegions() {
  const list = await db.select().from(subRegions).orderBy(subRegions.name);
  return list;
}

export async function CreateSubRegion(
  data: NewSubRegion,
): Promise<DataTableFormResponse<SubRegion>> {
  const [sr] = await db.insert(subRegions).values(data).returning();
  revalidatePath("/settings/sub-regions");
  return {
    success: true,
    message: "Sub-region created successfully",
    data: sr,
  };
}

export async function UpdateSubRegion(
  data: Partial<SubRegion>,
): Promise<DataTableFormResponse<SubRegion>> {
  const [upd] = await db
    .update(subRegions)
    .set(data)
    .where(eq(subRegions.id, data.id!))
    .returning();
  revalidatePath("/settings/sub-regions");
  return {
    success: true,
    message: "Sub-region updated successfully",
    data: upd,
  };
}

export async function DeleteSubRegion(
  id: number,
): Promise<DataTableFormResponse<SubRegion>> {
  await db.delete(subRegions).where(eq(subRegions.id, id));
  revalidatePath("/settings/sub-regions");
  return {
    success: true,
    message: "Sub-region deleted successfully",
  };
}
