"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  NewPowerStation,
  organisations,
  PowerStation,
  powerStations,
  serviceAreas,
} from "@/db/schema/utility";
import { getCurrentUser, hasGlobalUtilityAccess } from "@/lib/user.service";
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
