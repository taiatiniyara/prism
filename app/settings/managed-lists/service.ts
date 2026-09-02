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
import { isAllSentinelName } from "@/lib/managed-lists";
import { asc, eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

export async function GetAllManagedLists(filter?: {
  name?: string;
  excludeAll?: boolean;
}): Promise<ManagedList[]> {
  const items = await db
    .select()
    .from(managedListItems)
    .orderBy(asc(managedListItems.id));
  const query = db.select().from(managedLists).orderBy(managedLists.name);

  if (filter?.name) {
    query.where(like(managedLists.name, `%${filter.name}%`));
  }

  const list = await query;
  if (filter?.excludeAll) {
    return list
      .filter((l) => l.name.toLowerCase().includes("all") === false)
      .map((m) => ({
        ...m,
        items: items.filter((i) => i.list_id === m.id),
      }));
  }
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
    parent_id: toOptionalNumber(data.parent_id),
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

export async function GetAllManagedListItems(options?: {
  listName: string;
  excludeAll?: boolean;
}): Promise<ManagedListItem[]> {
  const query = db
    .select()
    .from(managedListItems)
    .orderBy(asc(managedListItems.id))
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id));

  if (options?.listName) {
    const ml = await db
      .select()
      .from(managedLists)
      .where(eq(managedLists.name, options.listName))
      .limit(1);
    if (ml.length === 0) {
      return [];
    }
    query.where(eq(managedListItems.list_id, ml[0].id));
  }
  const list = await query;
  return list
    .filter((item) =>
      options?.excludeAll
        ? !isAllSentinelName(item.managed_list_items.name)
        : true,
    )
    .map((item) => {
      const parent = list.find(
        (l) => l.managed_list_items.id === item.managed_list_items.parent_id,
      )?.managed_list_items;
      return {
        ...item.managed_list_items,
        list: item.managed_lists?.name,
        parent: parent?.name ?? null,
      };
    });
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
  const updateData: Partial<ManagedListItem> = { ...data };

  if ("parent_id" in data) {
    updateData.parent_id = toOptionalNumber(data.parent_id);
  }

  const query = db
    .update(managedListItems)
    .set(updateData)
    .where(eq(managedListItems.id, data.id!));

  const [result] = await query.returning();
  revalidatePath("/settings/managed-lists");
  return {
    message: "Managed list item updated successfully",
    data: result,
    success: true,
  };
}

export async function GetManagedListItemByName(
  name: string,
): Promise<ManagedListItem | null> {
  const [result] = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.name, name));
  return result || null;
}
