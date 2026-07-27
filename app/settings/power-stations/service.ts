"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  units,
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
import { buildParentMap, categoryFromTechnology } from "@/lib/energy-taxonomy";
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

export type UnitSummary = {
  id: number;
  name: string;
  technology: string | null;
  provider: string | null;
  category: string | null;
  service_area: string | null;
  capacity_mw: number | null;
  power_station_id: number | null;
  resource_qty: number | null;
};

export async function GetUnitList(): Promise<
  UnitSummary[]
> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const ml = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(ml);
  const parentById = buildParentMap(ml);

  const query = db
    .select({
      id: units.id,
      name: units.name,
      technology_id: units.technology_id,
      provider_id: units.provider_id,
      service_area_id: units.service_area_id,
      period_entries: units.period_entries,
      power_station_id: units.power_station_id,
      resource_qty: units.resource_qty,
    })
    .from(units)
    .leftJoin(
      serviceAreas,
      eq(units.service_area_id, serviceAreas.id),
    )
    .where(
      utilityScopeId != null
        ? and(
            eq(units.utility_id, utilityScopeId),
            eq(units.is_virtual, false),
          )
        : eq(units.is_virtual, false),
    )
    .orderBy(units.name);

  const list = await query;

  return list.map((item) => {
    const latestEntry = (item.period_entries ?? [])
      .slice()
      .sort((a, b) => b.report_period_id - a.report_period_id)[0];

    return {
      id: item.id,
      name: item.name,
      technology: resolveManagedListName(
        managedListNamesById,
        item.technology_id,
        null,
      ),
      provider: resolveManagedListName(
        managedListNamesById,
        item.provider_id,
        null,
      ),
      category: resolveManagedListName(
        managedListNamesById,
        categoryFromTechnology(item.technology_id, parentById),
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

export async function AssignUnitToPowerStation(
  unitId: number,
  powerStationId: number,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const where =
    utilityScopeId != null
      ? and(
          eq(units.id, unitId),
          eq(units.utility_id, utilityScopeId),
        )
      : eq(units.id, unitId);

  await db
    .update(units)
    .set({
      power_station_id: powerStationId,
      updated_by_id: user.id,
      updated_at: new Date(),
    })
    .where(where);

  revalidatePath("/settings/power-stations");
  return { success: true, message: "Energy resource assigned" };
}

export async function RemoveUnitFromPowerStation(
  unitId: number,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const where =
    utilityScopeId != null
      ? and(
          eq(units.id, unitId),
          eq(units.utility_id, utilityScopeId),
        )
      : eq(units.id, unitId);

  await db
    .update(units)
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
