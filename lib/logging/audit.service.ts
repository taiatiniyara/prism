import { db } from "@/db/connection";
import { auditLogs, type NewAuditLog } from "@/db/schema/audit-log";
import { headers } from "next/headers";
import { logger } from "@/lib/logging/logger";

export type AuditAction =
  | "user.activate"
  | "user.reject"
  | "user.deactivate"
  | "user.role_change"
  | "user.organisation_change"
  | "data_entry.create"
  | "data_entry.update"
  | "data_entry.delete"
  | "settings.kpi.update"
  | "settings.managed_list.update"
  | "settings.report_period.update"
  | "settings.organisation.update"
  | "settings.role.update"
  | "migration.import"
  | "migration.export"
  | "auth.login"
  | "auth.login_failed"
  | "auth.signup"
  | "auth.magic_link_sent"
  | "auth.logout"
  | "auth.2fa_verify"
  | "auth.2fa_failed";

export interface AuditEntryInput {
  action: AuditAction;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAuditLog(input: AuditEntryInput): Promise<void> {
  let ip = input.ipAddress ?? null;
  if (!ip) {
    try {
      const headerList = await headers();
      ip =
        headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headerList.get("x-real-ip") ??
        null;
    } catch {
      ip = null;
    }
  }

  const entry: NewAuditLog = {
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole ?? null,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    details: input.details ?? null,
    ipAddress: ip,
  };

  await db.insert(auditLogs).values(entry);
}

// Audit writes are best-effort: a DB failure must never break the underlying
// auth/data action that triggered the entry.
export async function tryWriteAuditLog(
  input: AuditEntryInput,
): Promise<void> {
  try {
    await writeAuditLog(input);
  } catch (error) {
    logger.error("[audit] failed to write audit log", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
