import { db } from "@/db/connection";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const [reportTypeList] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, "Report Type"))
    .limit(1);

  if (!reportTypeList) {
    return Response.json([]);
  }

  const items = await db
    .select()
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.list_id, reportTypeList.id),
        eq(managedListItems.is_active, true),
      ),
    );

  return Response.json(
    items.map((item) => ({ "Report Type": item.name })),
  );
}
