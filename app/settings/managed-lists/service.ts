"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  ManagedList,
  ManagedListItem,
  managedListItems,
  managedLists,
} from "@/db/schema/managedLists";
import { generateRandomNumber } from "@/lib/utils";
import { eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function GetAllManagedLists(filter?: { name?: string }) {
  const items = await db.select().from(managedListItems);
  const query = db.select().from(managedLists).orderBy(managedLists.name);

  if (filter?.name) {
    query.where(like(managedLists.name, `%${filter.name}%`));
  }

  const list = await query;
  return list.map((m) => ({
    ...m,
    items: items.filter((i) => i.list_id === m.id),
  }));
}

export async function CreateManagedListItem(
  data: ManagedListItem,
): Promise<DataTableFormResponse<ManagedListItem>> {
  const query = db.insert(managedListItems).values({
    ...data,
    is_active: true,
    id: generateRandomNumber(5),
  });

  const [result] = await query.returning();
  revalidatePath("/settings/managed-lists");
  return {
    message: "Managed list item created successfully",
    success: true,
    data: result,
  };
}

export async function GetAllManagedListItems(): Promise<ManagedListItem[]> {
  return await db.select().from(managedListItems);
}

export async function CreateManagedList(
  data: ManagedList,
): Promise<DataTableFormResponse<ManagedList>> {
  const query = db.insert(managedLists).values({
    ...data,
    is_active: true,
    id: generateRandomNumber(5),
  });

  const [result] = await query.returning();
  revalidatePath("/settings/managed-lists");
  return {
    message: "Managed list created successfully",
    data: result,
    success: true,
  };
}

export async function UpdateManagedList(
  data: Partial<ManagedList>,
): Promise<DataTableFormResponse<ManagedList>> {
  const query = db
    .update(managedLists)
    .set(data)
    .where(eq(managedLists.id, data.id!));

  const [result] = await query.returning();
  revalidatePath("/settings/managed-lists");
  return {
    message: "Managed list updated successfully",
    data: result,
    success: true,
  };
}

export async function UpdateManagedListItem(
  data: Partial<ManagedListItem>,
): Promise<DataTableFormResponse<ManagedListItem>> {
  const query = db
    .update(managedListItems)
    .set(data)
    .where(eq(managedListItems.id, data.id!));

  const [result] = await query.returning();
  revalidatePath("/settings/managed-lists");
  return {
    message: "Managed list item updated successfully",
    data: result,
    success: true,
  };
}
