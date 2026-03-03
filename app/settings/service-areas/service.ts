"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { NewServiceArea, ServiceArea, serviceAreas } from "@/db/schema/utility";
import { generateRandomNumber } from "@/lib/utils";
import { getCurrentUser } from "@/lib/user.service";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { managedListItems } from "@/db/schema/managedLists";

export async function AllServiceAreas(filters?: {
  all: boolean;
}): Promise<ServiceArea[]> {
  let query = db
    .select()
    .from(serviceAreas)
    .leftJoin(
      managedListItems,
      eq(serviceAreas.services_provided_id, managedListItems.id),
    );

  if (!filters?.all) {
    const user = await getCurrentUser();
    if (user.role !== "DEV" && user.role !== "BMO") {
      query.where(eq(serviceAreas.utility_id, user.org_id!));
    } else {
      query.where(eq(serviceAreas.utility_id, user.org_id!));
    }
  }

  const res = await query;
  return res.map((item) => ({
    ...item.service_areas,
    services_provided: item.managed_list_items?.name,
  }));
}

export async function AddServiceArea(
  data: NewServiceArea,
): Promise<DataTableFormResponse<ServiceArea>> {
  const user = await getCurrentUser();
  const [sa] = await db
    .insert(serviceAreas)
    .values({
      ...data,
      id: generateRandomNumber(5),
      utility_id: user.org_id!,
      is_active: true,
      is_virutal: false,
      operations_only: false,
      agg_level_id: 3,
    })
    .returning();
  revalidatePath("/settings/service-areas");
  return {
    success: true,
    message: "Service Area added successfully",
    data: sa,
  };
}

export async function UpdateServiceArea(data: Partial<ServiceArea>) {
  const [upd] = await db
    .update(serviceAreas)
    .set(data)
    .where(eq(serviceAreas.id, data.id!))
    .returning();

  revalidatePath("/settings/service-areas");
  return {
    success: true,
    message: "Data updated successfully",
    data: upd,
  };
}
