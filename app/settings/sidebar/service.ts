"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  NewSidebarAccess,
  SidebarAccess,
  sidebarAccess,
} from "@/db/schema/rls";
import { createUUID } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
export async function getSidebarAccessList() {
  const sideBarList = await db.select().from(sidebarAccess);
  return sideBarList;
}

export async function addSidebarAccess(
  data: NewSidebarAccess,
): Promise<DataTableFormResponse<SidebarAccess>> {
  const [newSA] = await db
    .insert(sidebarAccess)
    .values({
      ...data,
      id: createUUID(),
    })
    .returning();

  revalidatePath("/settings/sidebar");
  return {
    success: true,
    message: "Sidebar Access added successfully",
    data: newSA,
  };
}

export async function updateSidebarAccess(
  data: Partial<SidebarAccess>,
): Promise<DataTableFormResponse<SidebarAccess>> {
  const query = db
    .update(sidebarAccess)
    .set(data)
    .where(eq(sidebarAccess.id, data.id!));

  const [result] = await query.returning();
  revalidatePath("/settings/sidebar");
  return {
    message: "Sidebar Access updated successfully",
    data: result,
    success: true,
  };
}
