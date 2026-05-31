import { db } from "@/db/connection";
import { energyResources } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, asc } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json(authorize.message);
  }

  const resources = await db
    .select()
    .from(energyResources)
    .where(eq(energyResources.is_virtual, false))
    .orderBy(asc(energyResources.id));

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
      "Energy Provider": findItem(gen.energy_provider_id)?.name,
      "Energy Type": findItem(gen.energy_type_id)?.name,
      "Energy Source": findItem(gen.energy_source_id)?.name,
    })),
  );
}
