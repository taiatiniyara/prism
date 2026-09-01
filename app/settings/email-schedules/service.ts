"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  emailSchedules,
  EmailSchedule,
  NewEmailSchedule,
  scheduleSendLogs,
} from "@/db/schema/email-schedules";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { roles, user } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { sendEmail } from "@/lib/email/email.service";
import { getCurrentUser } from "@/lib/user.service";
import type { CurrentUser } from "@/lib/user.service";
import { GetReportPeriods } from "@/app/data-entry/service";

export async function AllEmailSchedules(): Promise<EmailSchedule[]> {
  const query = db
    .select()
    .from(emailSchedules)
    .leftJoin(organisations, eq(emailSchedules.utility_id, organisations.id))
    .orderBy(emailSchedules.created_at);
  const list = await query;
  return list.map((item) => ({
    ...item.email_schedules,
    utility_name: item.organisations?.acronym ?? item.organisations?.name,
  }));
}

export async function GetSendLogs(scheduleId: number) {
  return db
    .select()
    .from(scheduleSendLogs)
    .where(eq(scheduleSendLogs.schedule_id, scheduleId))
    .orderBy(desc(scheduleSendLogs.sent_at))
    .limit(20);
}

export async function CreateEmailSchedule(
  data: NewEmailSchedule,
): Promise<DataTableFormResponse<EmailSchedule>> {
  const [s] = await db.insert(emailSchedules).values(data).returning();
  revalidatePath("/settings/email-schedules");
  return { success: true, message: "Schedule created successfully", data: s };
}

export async function UpdateEmailSchedule(
  data: Partial<EmailSchedule>,
): Promise<DataTableFormResponse<EmailSchedule>> {
  const [upd] = await db
    .update(emailSchedules)
    .set({ ...data, updated_at: new Date() })
    .where(eq(emailSchedules.id, data.id!))
    .returning();
  revalidatePath("/settings/email-schedules");
  return { success: true, message: "Schedule updated successfully", data: upd };
}

export async function DeleteEmailSchedule(
  id: number,
): Promise<DataTableFormResponse<EmailSchedule>> {
  await db.delete(emailSchedules).where(eq(emailSchedules.id, id));
  revalidatePath("/settings/email-schedules");
  return { success: true, message: "Schedule deleted successfully" };
}

export async function SendSummaryNow(
  scheduleId: number,
  testEmail?: string,
): Promise<DataTableFormResponse<void>> {
  try {
    const [schedule] = await db
      .select()
      .from(emailSchedules)
      .where(eq(emailSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) return { success: false, message: "Schedule not found." };

    const result = await sendGlobalSummary(schedule, testEmail);

    const caller = await getCurrentUser().catch(() => null);

    await db.insert(scheduleSendLogs).values({
      schedule_id: scheduleId,
      recipient_count: result.sent,
      error_count: result.errors,
      sent_by: caller?.name ?? "system",
    });

    await db
      .update(emailSchedules)
      .set({ last_sent_at: new Date(), updated_at: new Date() })
      .where(eq(emailSchedules.id, schedule.id));

    return {
      success: result.sent > 0,
      message: testEmail
        ? `Test sent to ${testEmail}`
        : `Summary sent to ${result.sent} user(s).`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send.",
    };
  }
}

export async function SendTestToSelf(
  scheduleId: number,
): Promise<DataTableFormResponse<void>> {
  try {
    const caller = await getCurrentUser();
    return SendSummaryNow(scheduleId, caller.email);
  } catch {
    return { success: false, message: "Not authenticated." };
  }
}

async function sendGlobalSummary(
  schedule: EmailSchedule,
  testEmail?: string,
) {
  const userRole = await db
    .select()
    .from(roles)
    .where(eq(roles.name, schedule.recipient_role))
    .limit(1);

  if (userRole.length === 0) {
    throw new Error(`Role ${schedule.recipient_role} not found.`);
  }

  const roleId = userRole[0].id;

  const recipientWhere = [
    eq(user.role_id, roleId),
    eq(user.status, "active"),
  ];

  if (schedule.utility_id) {
    recipientWhere.push(eq(user.organisation_id, schedule.utility_id));
  }

  const recipients = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(and(...recipientWhere));

  const systemUser: CurrentUser = {
    id: "system",
    name: "System",
    email: "",
    role: "BMO",
    role_id: null,
    org_id: null,
    is_utility_context_scoped: false,
    status: "active",
    reject_reason: null,
  };

  const allPeriods = await GetReportPeriods(systemUser, {
    forceAllUtilities: true,
  });

  const isBLO = schedule.recipient_role === "BLO";

  let tableRows = "";
  let grandRequested = 0;
  let grandPending = 0;
  let grandEntered = 0;
  let grandReviewed = 0;
  let grandApproved = 0;

  for (const p of allPeriods) {
    grandRequested += p.Requested;
    grandPending += p.Pending;
    grandEntered += p.Entered;
    grandReviewed += p.Reviewed;
    grandApproved += p.Approved;

    const pct = p.Requested > 0 ? Math.round((p.Entered / p.Requested) * 100) : 0;

    tableRows += `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${p.Utility}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${p.Period}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${p.Report_Type}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.Requested}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.Entered}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.Reviewed}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.Approved}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.Pending}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${pct}%</td>
    </tr>`;
  }

  const grandPct = grandRequested > 0 ? Math.round((grandEntered / grandRequested) * 100) : 0;

  const highlightBlock = isBLO
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
        <strong style="color:#92400e;">Action Required:</strong>
        <span style="font-size:14px;">${grandPending + grandEntered} data points need review across all utilities.</span>
      </div>`
    : `<div style="background:#dbeafe;border:1px solid #3b82f6;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
        <strong style="color:#1e40af;">Action Required:</strong>
        <span style="font-size:14px;">${grandReviewed} reviewed data points need approval across all utilities.</span>
      </div>`;

  const html = `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;">
    <h2 style="color:#1e293b;">PRISM Data Entry Summary</h2>
    <p>Here is the ${schedule.frequency} data entry progress report across all utilities:</p>
    ${highlightBlock}
    <p style="margin:4px 0;color:#64748b;font-size:13px;">
      Totals — Requested: ${grandRequested} | Entered: ${grandEntered} | Reviewed: ${grandReviewed} | Approved: ${grandApproved} | Pending: ${grandPending} | % Entered: ${grandPct}%
    </p>
    <div style="max-height:600px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:4px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#f1f5f9;position:sticky;top:0;">
        <th style="padding:4px 8px;text-align:left;">Utility</th>
        <th style="padding:4px 8px;text-align:left;">Period</th>
        <th style="padding:4px 8px;text-align:left;">Type</th>
        <th style="padding:4px 8px;">Requested</th>
        <th style="padding:4px 8px;">Entered</th>
        <th style="padding:4px 8px;">Reviewed</th>
        <th style="padding:4px 8px;">Approved</th>
        <th style="padding:4px 8px;">Pending</th>
        <th style="padding:4px 8px;">% Entered</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table></div>
    <p style="margin-top:16px;color:#64748b;font-size:12px;">
      This is an automated ${schedule.frequency} summary from the PRISM benchmarking platform.
    </p>
  </div>`;

  let sent = 0;
  let errors = 0;

  for (const recipient of recipients) {
    try {
      if (testEmail) {
        await sendEmail({
          to: testEmail,
          subject: `[TEST] PRISM Data Entry Summary`,
          html,
        });
        sent++;
        break;
      } else {
        await sendEmail({
          to: recipient.email,
          subject: `PRISM Data Entry Summary`,
          html,
        });
        sent++;
      }
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}

export async function checkAndSendDueSchedules() {
  const now = new Date();
  const all = await db
    .select()
    .from(emailSchedules)
    .where(eq(emailSchedules.is_active, true));

  const results = [];

  for (const schedule of all) {
    if (!isDue(schedule, now)) continue;

    try {
      const result = await sendGlobalSummary(schedule);
      await db.insert(scheduleSendLogs).values({
        schedule_id: schedule.id,
        recipient_count: result.sent,
        error_count: result.errors,
        sent_by: "cron",
      });
      await db
        .update(emailSchedules)
        .set({ last_sent_at: new Date(), updated_at: new Date() })
        .where(eq(emailSchedules.id, schedule.id));
      results.push({ id: schedule.id, name: schedule.name, sent: result.sent });
    } catch (error) {
      results.push({
        id: schedule.id,
        name: schedule.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

function isDue(schedule: EmailSchedule, now: Date): boolean {
  if (now < new Date(schedule.starts_at)) return false;
  if (schedule.ends_at && now > new Date(schedule.ends_at)) return false;

  const lastSent = schedule.last_sent_at
    ? new Date(schedule.last_sent_at)
    : null;

  switch (schedule.frequency) {
    case "weekly": {
      if (now.getDay() !== (schedule.day_of_week ?? 0)) return false;
      if (!lastSent) return true;
      return (
        Math.floor(
          (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24),
        ) >= 7
      );
    }
    case "monthly": {
      if (now.getDate() !== (schedule.day_of_month ?? 1)) return false;
      if (!lastSent) return true;
      return (
        now.getMonth() !== lastSent.getMonth() ||
        now.getFullYear() !== lastSent.getFullYear()
      );
    }
    case "quarterly": {
      if (now.getDate() !== (schedule.day_of_month ?? 1)) return false;
      if (!lastSent) return true;
      const monthsPassed =
        (now.getFullYear() - lastSent.getFullYear()) * 12 +
        now.getMonth() -
        lastSent.getMonth();
      return monthsPassed >= 3;
    }
    case "annually": {
      const anchorMonth = new Date(schedule.starts_at).getMonth();
      if (now.getMonth() !== anchorMonth) return false;
      if (now.getDate() !== (schedule.day_of_month ?? 1)) return false;
      if (!lastSent) return true;
      return now.getFullYear() !== lastSent.getFullYear();
    }
    default:
      return false;
  }
}
