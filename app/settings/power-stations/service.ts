"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  energyResources,
  NewPowerStation,
  organisations,
  PowerStation,
  powerStations,
  serviceAreas,
} from "@/db/schema/utility";
import {
  getCurrentUser,
  hasGlobalUtilityAccess,
  resolveUtilityScopeId,
} from "@/lib/user.service";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";
import { managedListItems } from "@/db/schema/managedLists";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function AllPowerStations(): Promise<PowerStation[]> {
  const user = await getCurrentUser();

  const query = db
    .select()
    .from(powerStations)
    .leftJoin(serviceAreas, eq(powerStations.service_area_id, serviceAreas.id))
    .leftJoin(organisations, eq(powerStations.utility_id, organisations.id));

  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    query.where(eq(powerStations.utility_id, user.org_id!));
  }

  const res = await query.orderBy(powerStations.name);

  return res.map((item) => ({
    ...item.power_stations,
    service_area: item.service_areas?.name,
    utility: item.organisations?.name,
  }));
}

export async function AddPowerStation(
  data: NewPowerStation,
): Promise<DataTableFormResponse<PowerStation>> {
  const user = await getCurrentUser();

  const [powerStation] = await db
    .insert(powerStations)
    .values({
      ...data,
      utility_id: user.org_id!,
    })
    .returning();

  revalidatePath("/settings/power-stations");

  return {
    success: true,
    message: "Power station created successfully",
    data: powerStation,
  };
}

export type EnergyResourceSummary = {
  id: number;
  name: string;
  energy_source: string | null;
  energy_provider: string | null;
  energy_type: string | null;
  service_area: string | null;
  capacity_mw: number | null;
  power_station_id: number | null;
  resource_qty: number | null;
};

export async function GetEnergyResourceList(): Promise<
  EnergyResourceSummary[]
> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const ml = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(ml);

  const query = db
    .select({
      id: energyResources.id,
      name: energyResources.name,
      energy_source_id: energyResources.energy_source_id,
      energy_provider_id: energyResources.energy_provider_id,
      energy_type_id: energyResources.energy_type_id,
      service_area_id: energyResources.service_area_id,
      period_entries: energyResources.period_entries,
      power_station_id: energyResources.power_station_id,
      resource_qty: energyResources.resource_qty,
    })
    .from(energyResources)
    .leftJoin(
      serviceAreas,
      eq(energyResources.service_area_id, serviceAreas.id),
    )
    .where(
      utilityScopeId != null
        ? and(
            eq(energyResources.utility_id, utilityScopeId),
            eq(energyResources.is_virtual, false),
          )
        : eq(energyResources.is_virtual, false),
    )
    .orderBy(energyResources.name);

  const list = await query;

  return list.map((item) => {
    const latestEntry = (item.period_entries ?? [])
      .slice()
      .sort((a, b) => b.report_period_id - a.report_period_id)[0];

    return {
      id: item.id,
      name: item.name,
      energy_source: resolveManagedListName(
        managedListNamesById,
        item.energy_source_id,
        null,
      ),
      energy_provider: resolveManagedListName(
        managedListNamesById,
        item.energy_provider_id,
        null,
      ),
      energy_type: resolveManagedListName(
        managedListNamesById,
        item.energy_type_id,
        null,
      ),
      service_area: resolveManagedListName(
        managedListNamesById,
        item.service_area_id,
        null,
      ),
      capacity_mw: latestEntry?.capacity_mw ?? null,
      power_station_id: item.power_station_id ?? null,
      resource_qty: item.resource_qty ?? null,
    };
  });
}

export async function AssignEnergyResourceToPowerStation(
  energyResourceId: number,
  powerStationId: number,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const where =
    utilityScopeId != null
      ? and(
          eq(energyResources.id, energyResourceId),
          eq(energyResources.utility_id, utilityScopeId),
        )
      : eq(energyResources.id, energyResourceId);

  await db
    .update(energyResources)
    .set({
      power_station_id: powerStationId,
      updated_by_id: user.id,
      updated_at: new Date(),
    })
    .where(where);

  revalidatePath("/settings/power-stations");
  return { success: true, message: "Energy resource assigned" };
}

export async function RemoveEnergyResourceFromPowerStation(
  energyResourceId: number,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const where =
    utilityScopeId != null
      ? and(
          eq(energyResources.id, energyResourceId),
          eq(energyResources.utility_id, utilityScopeId),
        )
      : eq(energyResources.id, energyResourceId);

  await db
    .update(energyResources)
    .set({
      power_station_id: null,
      updated_by_id: user.id,
      updated_at: new Date(),
    })
    .where(where);

  revalidatePath("/settings/power-stations");
  return { success: true, message: "Energy resource removed from power station" };
}

export async function UpdatePowerStation(
  data: Partial<PowerStation>,
): Promise<DataTableFormResponse<PowerStation>> {
  const user = await getCurrentUser();
  const condition = hasGlobalUtilityAccess(user)
    ? eq(powerStations.id, data.id!)
    : and(
        eq(powerStations.id, data.id!),
        eq(powerStations.utility_id, user.org_id!),
      );

  const [powerStation] = await db
    .update(powerStations)
    .set({
      ...data,
      utility_id: hasGlobalUtilityAccess(user) ? data.utility_id : user.org_id!,
    })
    .where(condition)
    .returning();

  revalidatePath("/settings/power-stations");

  if (!powerStation) {
    return {
      success: false,
      message: "Unable to update power station",
    };
  }

  return {
    success: true,
    message: "Power station updated successfully",
    data: powerStation,
  };
}
