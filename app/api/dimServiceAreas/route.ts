import { db } from "@/db/connection";
import { serviceAreas } from "@/db/schema/utility";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const allServiceAreas = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.is_active, true));

  const [feederTypeList] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, "Feeder Type"))
    .limit(1);

  let feederTypeItemId: number | null = null;
  if (feederTypeList) {
    const [item] = await db
      .select()
      .from(managedListItems)
      .where(
        and(
          eq(managedListItems.list_id, feederTypeList.id),
          eq(managedListItems.is_active, true),
        ),
      )
      .limit(1);
    feederTypeItemId = item?.id ?? null;
  }

  return Response.json(
    allServiceAreas.map((sa) => ({
      "Service Area ID": sa.id,
      "Service Area": sa.name,
      "Utility ID": sa.utility_id,
      Feeder: feederTypeItemId ?? null,
    })),
  );
}
