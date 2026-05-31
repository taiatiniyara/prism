import { db } from "@/db/connection";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";

async function getManagedListByName(listName: string) {
  const [list] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, listName))
    .limit(1);
  if (!list) return null;
  const items = await db
    .select()
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.list_id, list.id),
        eq(managedListItems.is_active, true),
      ),
    );
  return items;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json(authorize.message);
  }

  const list = (await getManagedListByName("Energy Source")) ?? [];
  return Response.json(
    list.map((item) => ({ "Energy Source": item.name })),
  );
}
