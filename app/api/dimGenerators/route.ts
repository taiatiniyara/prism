import { db } from "@/db/connection";
import { units } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { user } from "@/db/schema/auth-schema";
import { eq, asc } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { buildParentMap, categoryFromTechnology } from "@/lib/energy-taxonomy";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const resources = await db
    .select()
    .from(units)
    .where(eq(units.is_virtual, false))
    .orderBy(asc(units.id));

  const allManagedItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const parentById = buildParentMap(allManagedItems);

  const users = await db.select({ id: user.id, name: user.name }).from(user);
  const userById = new Map(users.map((u) => [u.id, u.name]));

  function findItem(id: number | null) {
    if (!id) return undefined;
    return allManagedItems.find((m) => m.id === id);
  }

  return Response.json(
    resources.map((gen) => ({
      "Utility ID": gen.utility_id,
      "Service Area ID": gen.service_area_id,
      "Power Station ID": gen.power_station_id ?? null,
      "Generator ID": gen.id,
      "Generator Name": gen.name,
      "Energy Provider": findItem(gen.provider_id)?.name,
      "Energy Type": findItem(categoryFromTechnology(gen.technology_id, parentById))?.name,
      "Energy Source": findItem(gen.technology_id)?.name,
      "Updated By":
        gen.updated_by_id != null ? userById.get(gen.updated_by_id) ?? "" : "",
    })),
  );
}
