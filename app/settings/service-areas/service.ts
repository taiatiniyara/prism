"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { NewServiceArea, ServiceArea, serviceAreas } from "@/db/schema/utility";
import { generateRandomNumber } from "@/lib/utils";
import { getCurrentUser } from "@/services/user.service";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function AllServiceAreas() {
  const list: ServiceArea[] = [];
  const user = await getCurrentUser();
  let query = db.select().from(serviceAreas);
  if (user.role === "BLO") {
    query.where(eq(serviceAreas.utility_id, user.org_id!));
  }
  const res = await query;
  res.forEach((item) => {
    list.push(item);
  });
  return list;
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
