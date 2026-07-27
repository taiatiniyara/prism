import { db } from "@/db/connection";
import { units } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, asc } from "drizzle-orm";
import { authorizeApiKey } from "../service";

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
      "Energy Type": findItem(gen.category_id)?.name,
      "Energy Source": findItem(gen.technology_id)?.name,
    })),
  );
}
