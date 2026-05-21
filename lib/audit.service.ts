import { db } from "@/db/connection";
import { auditLogs, type NewAuditLog } from "@/db/schema/audit-log";
import { headers } from "next/headers";

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
  | "auth.mfa_enabled"
  | "auth.mfa_disabled";

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
