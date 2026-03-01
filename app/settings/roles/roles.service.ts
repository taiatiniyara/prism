"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { NewRole, Role, roles } from "@/db/schema/auth-schema";

export async function AllRoles() {
  const list = await db.select().from(roles);
  return list;
}

export async function CreateRole(
  data: NewRole,
): Promise<DataTableFormResponse<Role>> {
  const [list] = await db.insert(roles).values(data).returning();
  return {
    success: true,
    message: "Role created successfully",
    data: list,
  };
}
