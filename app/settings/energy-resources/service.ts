"use server";

import { db } from "@/db/connection";
import {
  EnergyResource,
  energyResources,
  NewEnergyResource,
  organisations,
  serviceAreas,
} from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { eq } from "drizzle-orm";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { revalidatePath } from "next/cache";

export async function GetAllEnergyResources(): Promise<EnergyResource[]> {
  const user = await getCurrentUser();
  const ml = await db.select().from(managedListItems);

  const query = db
    .select()
    .from(energyResources)
    .leftJoin(
      reportPeriods,
      eq(energyResources.report_period_id, reportPeriods.id),
    )
    .leftJoin(organisations, eq(energyResources.utility_id, organisations.id))
    .leftJoin(
      serviceAreas,
      eq(energyResources.service_area_id, serviceAreas.id),
    );
  if (user?.role !== "DEV") {
    query.where(eq(energyResources.utility_id, user.org_id!));
  }

  const list = await query.orderBy(energyResources.name);
  return list.map((item) => {
    const energy_provider = ml.find(
      (m) => m.id === item.energy_resources.energy_provider_id,
    );
    const energy_type = ml.find(
      (m) => m.id === item.energy_resources.energy_type_id,
    );
    const energy_source = ml.find(
      (m) => m.id === item.energy_resources.energy_source_id,
    );
    return {
      ...item.energy_resources,
      utility: item.organisations?.name,
      service_area: item.service_areas?.name,
      report_period: item.report_periods?.report_date
        ? item.report_periods?.report_date.toISOString().split("T")[0]
        : "",
      energy_provider: energy_provider?.name,
      energy_type: energy_type?.name,
      energy_source: energy_source?.name,
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
    updated_by_id: user.id,
    is_active: true,
    is_vitual: false,
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
  console.log(data);
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
