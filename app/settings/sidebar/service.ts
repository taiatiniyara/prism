"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  NewSidebarAccess,
  SidebarAccess,
  sidebarAccess,
} from "@/db/schema/rls";
import { createUUID } from "@/lib/utils";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
export async function getSidebarAccessList() {
  const sideBarList = await db
    .select()
    .from(sidebarAccess)
    .orderBy(asc(sidebarAccess.order), asc(sidebarAccess.name));
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

export async function reorderSidebarAccess(
  rows: {
    id: SidebarAccess["id"];
    order: number;
  }[],
): Promise<{ success: boolean; message: string }> {
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .update(sidebarAccess)
        .set({ order: row.order })
        .where(eq(sidebarAccess.id, row.id));
    }
  });

  revalidatePath("/settings/sidebar");
  return {
    success: true,
    message: "Sidebar order updated successfully",
  };
}
