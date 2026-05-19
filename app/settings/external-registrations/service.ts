"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  ExternalRegistration,
  externalRegistrations,
  user,
} from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function ExternalRegistrationsList(): Promise<ExternalRegistration[]> {
  const list = await db
    .select()
    .from(externalRegistrations)
    .orderBy(externalRegistrations.date_created);
  return list;
}

export async function AcceptExternalRegistration(
  registrationId: number,
  roleId: number,
): Promise<DataTableFormResponse<ExternalRegistration>> {
  const currentUser = await getCurrentUser();

  if (!currentUser.role || (currentUser.role !== "BMO" && currentUser.role !== "DEV")) {
    return {
      success: false,
      message: "Only BMO/DEV users can accept external registrations.",
    };
  }

  const [registration] = await db
    .select()
    .from(externalRegistrations)
    .where(eq(externalRegistrations.id, registrationId))
    .limit(1);

  if (!registration) {
    return { success: false, message: "Registration not found." };
  }

  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.name, registration.organisation))
    .limit(1);

  if (!org) {
    return {
      success: false,
      message: `Organisation "${registration.organisation}" not found. Please create it first.`,
    };
  }

  await db.insert(user).values({
    id: crypto.randomUUID(),
    name: registration.name,
    email: registration.email,
    organisation_id: org.id,
    role_id: roleId,
    status: "active",
    date_approved: new Date(),
    dataset_required: registration.dataset_required,
    data_access_reason: registration.data_access_reason,
    emailVerified: false,
  });

  await db
    .delete(externalRegistrations)
    .where(eq(externalRegistrations.id, registrationId));

  revalidatePath("/settings/external-registrations");
  return {
    success: true,
    message: `User ${registration.name} accepted and activated.`,
    data: registration,
  };
}

export async function RejectExternalRegistration(
  registrationId: number,
): Promise<DataTableFormResponse<ExternalRegistration>> {
  const currentUser = await getCurrentUser();

  if (!currentUser.role || (currentUser.role !== "BMO" && currentUser.role !== "DEV")) {
    return {
      success: false,
      message: "Only BMO/DEV users can reject external registrations.",
    };
  }

  const [registration] = await db
    .select()
    .from(externalRegistrations)
    .where(eq(externalRegistrations.id, registrationId))
    .limit(1);

  if (!registration) {
    return { success: false, message: "Registration not found." };
  }

  await db
    .delete(externalRegistrations)
    .where(eq(externalRegistrations.id, registrationId));

  revalidatePath("/settings/external-registrations");
  return {
    success: true,
    message: `Registration from ${registration.name} rejected.`,
    data: registration,
  };
}
