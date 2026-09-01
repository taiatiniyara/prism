"use server";

import { registerUser } from "@/app/auth/service";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  NewUser,
  type RegistrationClarificationDirection,
  roles,
  type User,
  type UserStatus,
  user,
  userRegistrationClarificationMessage,
  userStatusEvent,
} from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import {
  buildRegistrationClarificationEmail,
  sendEmail,
} from "@/lib/email/email.service";
import { assertValidTransition, type StatusDecision } from "@/lib/user-status";
import { getCurrentUser } from "@/lib/user.service";
import { writeAuditLog } from "@/lib/logging/audit.service";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";

export async function AllUsers() {
  const list = db
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
  if (currentUser.role !== "DEV" && currentUser.role !== "BMO") {
    data.organisation_id = currentUser.org_id!;
  }
  await registerUser({
    email: data.email,
    firstName: data.name.split(" ")[0],
    lastName: data.name.split(" ").pop() || "",
    datasetsRequired: data.dataset_required || "",
    dataAccessReason: data.data_access_reason || "",
    organisationId: data.organisation_id || 1,
    roleId: Number(data.role_id) || 1,
  });

  await db
    .update(user)
    .set({
      status: "active",
    })
    .where(eq(user.email, data.email))
    .returning();

  writeAuditLog({
    action: "user.activate",
    actorUserId: currentUser.id,
    actorEmail: currentUser.email,
    actorRole: currentUser.role,
    targetType: "user",
    targetId: data.email,
    details: {
      name: data.name,
      roleId: data.role_id,
      organisationId: data.organisation_id,
    },
  }).catch((err) => console.error("[audit] user.create failed", err));

  revalidatePath("/settings/users");
  return {
    success: true,
    message: "User created successfully",
  };
}

export async function UpdateUser(
  data: Partial<User>,
): Promise<DataTableFormResponse<User>> {
  const currentUser = await getCurrentUser();
  assertAdminRole(currentUser.role);

  const { id, ...allFields } = data as Partial<User> & { id?: string };
  delete allFields.role;
  delete allFields.organisation;

  if (!id) {
    return { success: false, message: "User ID is required" };
  }

  if (allFields.email) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, allFields.email))
      .limit(1);
    if (existing && existing.id !== id) {
      return {
        success: false,
        message: "A user with this email already exists",
      };
    }
  }

  if (allFields.role_id !== undefined) {
    allFields.role_id = Number(allFields.role_id);
  }
  if (allFields.organisation_id !== undefined) {
    allFields.organisation_id = Number(allFields.organisation_id);
  }

  await db.update(user).set(allFields).where(eq(user.id, id));

  writeAuditLog({
    action: "user.role_change",
    actorUserId: currentUser.id,
    actorEmail: currentUser.email,
    actorRole: currentUser.role,
    targetType: "user",
    targetId: id,
    details: allFields as Record<string, unknown>,
  }).catch((err) => console.error("[audit] user.update failed", err));

  revalidatePath("/settings/users");
  return {
    success: true,
    message: "User updated successfully",
  };
}

function assertAdminRole(role?: string | null) {
  if (role !== "DEV" && role !== "BMO") {
    throw new Error("FORBIDDEN: only BMO/DEV users can perform this action");
  }
}

function normalizeClarificationStorageError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("user_registration_clarification_message") &&
    message.includes("does not exist")
  ) {
    throw new Error(
      "SETUP: clarification storage is not available yet. Run database migration 0024 (for example with npm run db-push).",
    );
  }

  throw error instanceof Error ? error : new Error(message);
}

const CLARIFICATION_REF_PREFIX = "PRISM-REF";

const getInboundReferenceSecret = (): string => {
  return process.env.EMAIL_INBOUND_REFERENCE_SECRET?.trim() || "";
};

const buildClarificationReference = (userId: string): string => {
  const secret = getInboundReferenceSecret();
  if (!secret) {
    throw new Error(
      "SETUP: EMAIL_INBOUND_REFERENCE_SECRET must be configured to auto-log email responses.",
    );
  }

  const signature = createHmac("sha256", secret).update(userId).digest("hex");
  return `${userId}.${signature.slice(0, 24)}`;
};

const parseReferenceFromSubject = (subject: string): string | null => {
  const match = subject.match(/\[PRISM-REF:([^\]]+)\]/i);
  return match?.[1]?.trim() || null;
};

const resolveUserIdFromReference = (reference: string): string | null => {
  const parts = reference.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [userId, providedSignature] = parts;
  if (!userId || !providedSignature) {
    return null;
  }

  const secret = getInboundReferenceSecret();
  if (!secret) {
    throw new Error(
      "SETUP: EMAIL_INBOUND_REFERENCE_SECRET must be configured to auto-log email responses.",
    );
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(userId)
    .digest("hex")
    .slice(0, 24);

  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  return timingSafeEqual(provided, expected) ? userId : null;
};

const stripHtml = (value: string): string => {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

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

export type RegistrationClarificationMessage = {
  id: number;
  userId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  direction: RegistrationClarificationDirection;
  subject: string | null;
  message: string;
  receivedFromEmail: string | null;
  createdAt: Date;
};

export async function listRegistrationClarificationMessages(
  userId: string,
): Promise<RegistrationClarificationMessage[]> {
  const currentUser = await getCurrentUser();
  assertAdminRole(currentUser.role);

  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!target) {
    throw new Error("NOT_FOUND: user not found");
  }

  let rows: Array<typeof userRegistrationClarificationMessage.$inferSelect> =
    [];
  try {
    rows = await db
      .select()
      .from(userRegistrationClarificationMessage)
      .where(eq(userRegistrationClarificationMessage.target_user_id, userId));
  } catch (error) {
    normalizeClarificationStorageError(error);
  }

  if (rows.length === 0) {
    return [];
  }

  const actorIds = Array.from(new Set(rows.map((row) => row.actor_user_id)));
  const actors = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(inArray(user.id, actorIds));

  const actorById = new Map(
    actors.map((actor) => [actor.id, { name: actor.name, email: actor.email }]),
  );

  return rows
    .slice()
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    .map((row) => ({
      id: row.id,
      userId: row.target_user_id,
      actorUserId: row.actor_user_id,
      actorName: actorById.get(row.actor_user_id)?.name ?? null,
      actorEmail: actorById.get(row.actor_user_id)?.email ?? null,
      direction: row.direction,
      subject: row.subject,
      message: row.message,
      receivedFromEmail: row.received_from_email,
      createdAt: row.created_at,
    }));
}

export async function sendRegistrationClarificationMessage(input: {
  userId: string;
  subject: string;
  message: string;
}) {
  const currentUser = await getCurrentUser();
  assertAdminRole(currentUser.role);

  const subject = input.subject.trim();
  const message = input.message.trim();

  if (!subject) {
    throw new Error("VALIDATION: subject is required");
  }

  if (!message) {
    throw new Error("VALIDATION: message is required");
  }

  const [target] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
    })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  if (!target) {
    throw new Error("NOT_FOUND: user not found");
  }

  if (target.status !== "pending") {
    throw new Error(
      "INVALID_TRANSITION: clarification can only be sent for pending users",
    );
  }

  const clarificationReference = buildClarificationReference(target.id);

  const emailPayload = buildRegistrationClarificationEmail({
    requesterName: target.name,
    subject,
    clarificationMessage: message,
    referenceTag: `[${CLARIFICATION_REF_PREFIX}:${clarificationReference}]`,
  });

  try {
    await sendEmail({
      to: target.email,
      subject: emailPayload.subject,
      html: emailPayload.html,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`EMAIL: ${message}`);
  }

  let inserted: typeof userRegistrationClarificationMessage.$inferSelect;
  try {
    [inserted] = await db
      .insert(userRegistrationClarificationMessage)
      .values({
        target_user_id: target.id,
        actor_user_id: currentUser.id,
        direction: "outbound",
        subject,
        message,
        received_from_email: null,
      })
      .returning();
  } catch (error) {
    normalizeClarificationStorageError(error);
  }

  revalidatePath("/settings/users");

  return {
    id: inserted.id,
    userId: inserted.target_user_id,
    direction: inserted.direction,
    createdAt: inserted.created_at,
  };
}

export async function logRegistrationClarificationResponse(input: {
  userId: string;
  subject?: string;
  message: string;
  receivedFromEmail?: string;
}) {
  const currentUser = await getCurrentUser();
  assertAdminRole(currentUser.role);

  const subject = input.subject?.trim() || null;
  const message = input.message.trim();
  const receivedFromEmail = input.receivedFromEmail?.trim() || null;

  if (!message) {
    throw new Error("VALIDATION: message is required");
  }

  const [target] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  if (!target) {
    throw new Error("NOT_FOUND: user not found");
  }

  let inserted: typeof userRegistrationClarificationMessage.$inferSelect;
  try {
    [inserted] = await db
      .insert(userRegistrationClarificationMessage)
      .values({
        target_user_id: target.id,
        actor_user_id: currentUser.id,
        direction: "inbound",
        subject,
        message,
        received_from_email: receivedFromEmail || target.email,
      })
      .returning();
  } catch (error) {
    normalizeClarificationStorageError(error);
  }

  revalidatePath("/settings/users");

  return {
    id: inserted.id,
    userId: inserted.target_user_id,
    direction: inserted.direction,
    createdAt: inserted.created_at,
  };
}

export async function logRegistrationClarificationInboundReply(input: {
  subject?: string | null;
  message?: string | null;
  html?: string | null;
  fromEmail?: string | null;
}): Promise<
  | {
      logged: true;
      userId: string;
      messageId: number;
    }
  | {
      logged: false;
      reason: "missing_reference" | "invalid_reference" | "unknown_sender";
    }
> {
  const subject = (input.subject || "").trim();
  const fromEmail = (input.fromEmail || "").trim();
  const message =
    (input.message || "").trim() || stripHtml((input.html || "").trim());

  if (!fromEmail) {
    throw new Error("VALIDATION: fromEmail is required");
  }

  if (!message) {
    throw new Error("VALIDATION: message is required");
  }

  if (!subject) {
    throw new Error("VALIDATION: subject is required");
  }

  const reference = parseReferenceFromSubject(subject);
  if (!reference) {
    return {
      logged: false,
      reason: "missing_reference",
    };
  }

  const userId = resolveUserIdFromReference(reference);
  if (!userId) {
    return {
      logged: false,
      reason: "invalid_reference",
    };
  }

  const [target] = await db
    .select({
      id: user.id,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!target) {
    return {
      logged: false,
      reason: "invalid_reference",
    };
  }

  if (target.email.trim().toLowerCase() !== fromEmail.toLowerCase()) {
    return {
      logged: false,
      reason: "unknown_sender",
    };
  }

  let inserted: typeof userRegistrationClarificationMessage.$inferSelect;
  try {
    [inserted] = await db
      .insert(userRegistrationClarificationMessage)
      .values({
        target_user_id: target.id,
        actor_user_id: target.id,
        direction: "inbound",
        subject,
        message,
        received_from_email: fromEmail,
      })
      .returning();
  } catch (error) {
    normalizeClarificationStorageError(error);
  }

  revalidatePath("/settings/users");

  return {
    logged: true,
    userId: target.id,
    messageId: inserted.id,
  };
}

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

  const { writeAuditLog } = await import("@/lib/logging/audit.service");
  await writeAuditLog({
    action: `user.${input.decision}` as const,
    actorUserId: currentUser.id,
    actorEmail: currentUser.email,
    actorRole: currentUser.role,
    targetType: "user",
    targetId: updated.id,
    details: {
      fromStatus: currentRecord.status,
      toStatus: updated.status,
      reason: updated.reject_reason,
    },
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
