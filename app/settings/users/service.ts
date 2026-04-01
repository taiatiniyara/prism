"use server";

import { registerUser } from "@/app/auth/service";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  NewUser,
  roles,
  type User,
  type UserStatus,
  user,
  userStatusEvent,
} from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { assertValidTransition, type StatusDecision } from "@/lib/user-status";
import { getCurrentUser } from "@/lib/user.service";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
  const currentUser = await getCurrentUser();
  console.log(data);
  if (currentUser.role !== "DEV" && currentUser.role !== "BMO") {
    data.organisation_id = currentUser.org_id!;
  }
  registerUser({
    email: data.email,
    firstName: data.name.split(" ")[0],
    lastName: data.name.split(" ").pop() || "",
    datasetsRequired: data.dataset_required || "",
    dataAccessReason: data.data_access_reason || "",
    organisationId: data.organisation_id || 1,
    roleId: Number(data.role_id) || 1,
  }).then(async () => {
    await db
      .update(user)
      .set({
        status: "active",
      })
      .where(eq(user.email, data.email))
      .returning();
  });
  revalidatePath("/settings/users");
  return {
    success: true,
    message: "User created successfully",
  };
}

function assertAdminRole(role?: string | null) {
  if (role !== "DEV" && role !== "BMO") {
    throw new Error("FORBIDDEN: only BMO/DEV users can perform this action");
  }
}

export type PendingUserListItem = {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  registrationDate: Date;
  datasetRequired: string | null;
  dataAccessReason: string | null;
  status: "pending";
};

export async function listPendingUsers(): Promise<PendingUserListItem[]> {
  const currentUser = await getCurrentUser();
  assertAdminRole(currentUser.role);

  const rows = await db
    .select()
    .from(user)
    .leftJoin(organisations, eq(user.organisation_id, organisations.id))
    .where(eq(user.status, "pending"));

  return rows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    organisation: row.organisations?.name ?? null,
    registrationDate: row.user.createdAt,
    datasetRequired: row.user.dataset_required,
    dataAccessReason: row.user.data_access_reason,
    status: "pending",
  }));
}

export type DecisionResult = {
  userId: string;
  fromStatus: UserStatus;
  toStatus: UserStatus;
  applied: boolean;
  rejectionReason: string | null;
  decidedAt: Date;
  decidedBy: string;
};

export async function applyPendingUserDecision(input: {
  userId: string;
  decision: StatusDecision;
  rejectionReason?: string;
}): Promise<DecisionResult> {
  const currentUser = await getCurrentUser();
  assertAdminRole(currentUser.role);

  const reason = input.rejectionReason?.trim() || "";
  if (input.decision === "reject" && reason.length === 0) {
    throw new Error("VALIDATION: rejection reason is required");
  }

  const [currentRecord] = await db
    .select()
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  if (!currentRecord) {
    throw new Error("NOT_FOUND: user not found");
  }

  const now = new Date();
  const toStatus = assertValidTransition(currentRecord.status, input.decision);

  const [updated] = await db
    .update(user)
    .set({
      status: toStatus,
      date_approved: toStatus === "active" ? now : currentRecord.date_approved,
      date_rejected:
        toStatus === "deactivated" ? now : currentRecord.date_rejected,
      rejected_by_user_id:
        toStatus === "deactivated"
          ? currentUser.id
          : currentRecord.rejected_by_user_id,
      reject_reason: toStatus === "deactivated" ? reason : null,
    })
    .where(and(eq(user.id, input.userId), eq(user.status, "pending")))
    .returning();

  if (!updated) {
    return {
      userId: currentRecord.id,
      fromStatus: currentRecord.status,
      toStatus: currentRecord.status,
      applied: false,
      rejectionReason: currentRecord.reject_reason,
      decidedAt: now,
      decidedBy: currentUser.id,
    };
  }

  await db.insert(userStatusEvent).values({
    target_user_id: updated.id,
    actor_user_id: currentUser.id,
    from_status: currentRecord.status,
    to_status: updated.status,
    decision_type: input.decision,
    reason: updated.reject_reason,
  });

  revalidatePath("/settings/users");
  revalidatePath("/dashboard");

  return {
    userId: updated.id,
    fromStatus: currentRecord.status,
    toStatus: updated.status,
    applied: true,
    rejectionReason: updated.reject_reason,
    decidedAt: now,
    decidedBy: currentUser.id,
  };
}
