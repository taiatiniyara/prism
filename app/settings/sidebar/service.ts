"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  NewSidebarAccess,
  SidebarAccess,
  sidebarAccess,
} from "@/db/schema/rls";
import { createUUID } from "@/lib/utils";
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
