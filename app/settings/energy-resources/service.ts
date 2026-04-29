"use server";

import { db } from "@/db/connection";
import {
  EnergyResource,
  energyResources,
  NewEnergyResource,
  organisations,
  powerStations,
  serviceAreas,
} from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { and, eq } from "drizzle-orm";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { managedListItems } from "@/db/schema/managedLists";
import { revalidatePath } from "next/cache";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";

export async function GetAllEnergyResources(): Promise<EnergyResource[]> {
  const user = await getCurrentUser();
  const ml = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(ml);

  const query = db
    .select()
    .from(energyResources)
    .leftJoin(organisations, eq(energyResources.utility_id, organisations.id))
    .leftJoin(
      serviceAreas,
      eq(energyResources.service_area_id, serviceAreas.id),
    )
    .leftJoin(
      powerStations,
      eq(energyResources.power_station_id, powerStations.id),
    );
  if (user?.role !== "DEV") {
    query.where(
      and(
        eq(energyResources.utility_id, user.org_id!),
        eq(energyResources.is_virtual, false),
      ),
    );
  }

  const list = await query.orderBy(energyResources.name);
  return list.map((item) => {
    return {
      ...item.energy_resources,
      utility: item.organisations?.name,
      power_station: item.power_stations?.name,
      service_area: item.service_areas?.name,
      report_period: "",
      energy_provider: resolveManagedListName(
        managedListNamesById,
        item.energy_resources.energy_provider_id,
        null,
      ),
      energy_type: resolveManagedListName(
        managedListNamesById,
        item.energy_resources.energy_type_id,
        null,
      ),
      energy_source: resolveManagedListName(
        managedListNamesById,
        item.energy_resources.energy_source_id,
        null,
      ),
      type: resolveManagedListName(
        managedListNamesById,
        item.energy_resources.type_id,
        null,
      ),
    };
  });
}

export async function CreateEnergyResource(
  data: NewEnergyResource,
): Promise<DataTableFormResponse<EnergyResource>> {
  const user = await getCurrentUser();
  const query = db.insert(energyResources).values({
    ...data,
    utility_id: user.org_id!,
    period_entries: data.period_entries ?? [],
    updated_by_id: user.id,
    is_virtual: false,
    agg_level_id: 1,
    updated_at: new Date(),
  });
  revalidatePath("/settings/energy-resources");
  const [result] = await query.returning();
  return {
    success: true,
    message: "Energy Resource created successfully",
    data: result,
  };
}

export async function UpdateEnergyResource(
  data: Partial<EnergyResource>,
): Promise<DataTableFormResponse<EnergyResource>> {
  const user = await getCurrentUser();
  const query = db
    .update(energyResources)
    .set({
      ...data,
      updated_by_id: user.id,
      updated_at: new Date(),
    })
    .where(eq(energyResources.id, data.id!));
  const [result] = await query.returning();
  revalidatePath("/settings/energy-resources");
  return {
    success: true,
    message: "Energy Resource updated successfully",
    data: result,
  };
}
