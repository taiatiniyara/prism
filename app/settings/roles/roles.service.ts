"use server";
import { generateRandomNumber } from "@/lib/utils";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { eq } from "drizzle-orm";
import { NewRole, Role, roles } from "@/db/schema/auth-schema";
import { revalidatePath } from "next/cache";

export async function AllRoles() {
  const list = await db.select().from(roles);
  return list;
}

export async function CreateRole(
  data: NewRole,
): Promise<DataTableFormResponse<Role>> {
  data.id = generateRandomNumber(4);
  const [list] = await db.insert(roles).values(data).returning();
  revalidatePath("/settings/roles");
  return {
    success: true,
    message: "Role created successfully",
    data: list,
  };
}

export async function DeleteRole(id: number) {
  await db.delete(roles).where(eq(roles.id, id));
  revalidatePath("/settings/roles");
}

export async function UpdateRole(data: Partial<Role>) {
  const [list] = await db
    .update(roles)
    .set(data)
    .where(eq(roles.id, data.id!))
    .returning();
  revalidatePath("/settings/roles");
  return {
    success: true,
    message: "Role updated successfully",
    data: list,
  };
}
