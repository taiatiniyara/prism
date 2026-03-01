"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { NewServiceArea, ServiceArea, serviceAreas } from "@/db/schema/utility";
import { getCurrentUser } from "@/services/user.service";
import { eq } from "drizzle-orm";

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
  const [sa] = await db.insert(serviceAreas).values(data).returning();
  return {
    success: true,
    message: "Service Area added successfully",
    data: sa,
  };
}
