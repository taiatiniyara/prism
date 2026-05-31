import { db } from "@/db/connection";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";

async function getManagedListByName(
  listName: string,
  activeOnly?: boolean,
) {
  const [list] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, listName))
    .limit(1);
  if (!list) return null;

  const conditions = [eq(managedListItems.list_id, list.id)];
  if (activeOnly) {
    conditions.push(eq(managedListItems.is_active, true));
  }

  const items = await db.select().from(managedListItems).where(and(...conditions));
  return items;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json(authorize.message);
  }

  const customerTypes = (
    (await getManagedListByName("Customer Type", true)) ?? []
  ).filter((ct) => !ct.name.includes("All"));

  const paymentModes = (
    (await getManagedListByName("Payment Mode")) ?? []
  ).filter((pm) => !pm.name.includes("All"));

  return Response.json(
    paymentModes.map((paymentMode) =>
      customerTypes.map((customerType) => ({
        "Customer Class": paymentMode.name + " " + customerType.name,
      })),
    ),
  );
}
