import { db } from "@/db/connection";
import { assertMigrationKey } from "../prism-training/_lib";
import { managedListItems, managedLists } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  assertMigrationKey(req);
  const ml = await db
    .select()
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedLists.id, managedListItems.list_id));

  return Response.json(
    ml.map((m) => {
      return {
        id: m.managed_list_items.id,
        name: m.managed_list_items.name,
        typeId: m.managed_lists?.id,
        parentId: m.managed_list_items.parent_id,
        isActive: m.managed_list_items.is_active,
      };
    }),
  );
}
