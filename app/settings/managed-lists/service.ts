"use server";

import { db } from "@/db/connection";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { like } from "drizzle-orm";

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
