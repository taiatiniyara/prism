"use server";

import { registerUser } from "@/app/auth/service";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { NewUser, roles, User, user } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { getCurrentUser } from "@/services/user.service";
import { eq } from "drizzle-orm";

export async function AllUsers() {
  let list = db
    .select()
    .from(user)
    .leftJoin(roles, eq(user.role_id, roles.id))
    .leftJoin(organisations, eq(user.organisation_id, organisations.id));
  const currentUser = await getCurrentUser();
  if (currentUser.role === "BLO") {
    list.where(eq(user.organisation_id, currentUser.org_id!));
  }

  const users = await list;
  return users.map((u) => ({
    ...u.user,
    role: u.roles?.name,
    organisation: u.organisations?.acronym,
  }));
}

export async function CreateUser(
  data: NewUser,
): Promise<DataTableFormResponse<User>> {
  registerUser({
    email: data.email,
    firstName: data.name,
    lastName: data.name,
    datasetsRequired: data.dataset_required || "",
    dataAccessReason: data.data_access_reason || "",
    organisationId: data.organisation_id || 1,
    roleId: data.role_id || 1,
  }).then(async () => {
    await db
      .update(user)
      .set({
        status: "active",
      })
      .where(eq(user.email, data.email))
      .returning();
  });

  return {
    success: true,
    message: "User created successfully",
  };
}
