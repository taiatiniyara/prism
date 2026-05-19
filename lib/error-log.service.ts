import { and, eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { errorLogs, NewErrorLog } from "@/db/schema/error-log";
import { roles, user } from "@/db/schema/auth-schema";
import { sendEmail } from "@/lib/email.service";

export type ErrorLogInput = Omit<
  NewErrorLog,
  "id" | "createdAt" | "userId" | "userEmail" | "userRole"
> & {
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
};

export async function logError(input: ErrorLogInput): Promise<number> {
  const [created] = await db
    .insert(errorLogs)
    .values({
      source: input.source,
      errorType: input.errorType,
      severity: input.severity ?? "error",
      message: input.message,
      stack: input.stack ?? null,
      context: input.context ?? null,
      url: input.url ?? null,
      userId: input.userId ?? null,
      userEmail: input.userEmail ?? null,
      userRole: input.userRole ?? null,
    })
    .returning({ id: errorLogs.id });

  return created.id;
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);

const truncate = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max - 3) + "..." : value;

export async function logErrorAndNotifyDev(input: ErrorLogInput): Promise<void> {
  await logError(input);

  try {
    const devRecipients = await db
      .select({
        id: user.id,
        email: user.email,
      })
      .from(user)
      .innerJoin(roles, eq(user.role_id, roles.id))
      .where(and(eq(roles.name, "DEV"), eq(user.status, "active")));

    if (devRecipients.length === 0) return;

    const severityBadge =
      input.severity === "critical"
        ? "#b91c1c"
        : input.severity === "warning"
          ? "#d97706"
          : "#dc2626";

    const severityLabel = (input.severity ?? "error").toUpperCase();

    const html = `
<div style="margin:0;padding:24px 12px;background:#f3f6fb;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#17213a">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #dce3ef;border-radius:14px;overflow:hidden">
    <tr>
      <td style="padding:16px 24px;background:#0f172a;text-align:center">
        <img src="https://dev.prismdashboard.org/logo.png" alt="PRISM" width="140" style="display:block;height:auto;margin:0 auto">
      </td>
    </tr>
    <tr>
      <td style="padding:0;background:#450a0a">
        <div style="padding:18px 24px 10px 24px;color:#fecaca;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">Error Alert</div>
        <div style="padding:0 24px 20px 24px;color:#fff;font-size:24px;line-height:1.25;font-weight:700">${esc(truncate(input.message, 120))}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 24px 8px 24px">
        <div style="display:inline-block;padding:5px 10px;border-radius:999px;background:${severityBadge};color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">${esc(severityLabel)}</div>
        <p style="margin:14px 0 0 0;color:#26334d;font-size:14px;line-height:1.6">
          A new error has been logged in the PRISM system.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 12px 24px">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #e3e8f2;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;width:160px;color:#4f5d75;font-size:13px;font-weight:600;vertical-align:top">Source</td><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#17213a;font-size:13px;line-height:1.5;vertical-align:top">${esc(input.source)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#4f5d75;font-size:13px;font-weight:600;vertical-align:top">Type</td><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#17213a;font-size:13px;line-height:1.5;vertical-align:top">${esc(input.errorType)}</td></tr>
          ${input.url ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#4f5d75;font-size:13px;font-weight:600;vertical-align:top">URL</td><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#17213a;font-size:13px;line-height:1.5;vertical-align:top">${esc(input.url)}</td></tr>` : ""}
          ${input.userEmail ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#4f5d75;font-size:13px;font-weight:600;vertical-align:top">User</td><td style="padding:8px 12px;border-bottom:1px solid #e3e8f2;color:#17213a;font-size:13px;line-height:1.5;vertical-align:top">${esc(input.userEmail)}${input.userRole ? ` (${esc(input.userRole)})` : ""}</td></tr>` : ""}
          <tr><td style="padding:8px 12px;color:#4f5d75;font-size:13px;font-weight:600;vertical-align:top">Message</td><td style="padding:8px 12px;color:#17213a;font-size:13px;line-height:1.5;vertical-align:top;word-break:break-word">${esc(truncate(input.message, 500))}</td></tr>
        </table>
      </td>
    </tr>
    ${input.stack ? `<tr><td style="padding:8px 24px 12px 24px"><div style="padding:12px 14px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:11px;line-height:1.5;font-family:monospace;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all">${esc(truncate(input.stack, 2000))}</div></td></tr>` : ""}
    <tr>
      <td style="padding:4px 24px 22px 24px">
        <div style="padding:12px 14px;border-radius:10px;background:#f7f9fd;border:1px solid #e3e8f2;color:#3a4a67;font-size:12px;line-height:1.6">
          This is an automated notification from the PRISM error monitoring system. Check the application logs or database error_logs table for full details.
        </div>
      </td>
    </tr>
  </table>
</div>`;

    await Promise.allSettled(
      devRecipients.map((recipient) =>
        sendEmail({
          to: recipient.email,
          subject: `[${severityLabel}] PRISM Error: ${truncate(input.message, 80)}`,
          html,
        }),
      ),
    );
  } catch (notifyError) {
    console.error("Failed to notify DEV users about error log entry", {
      error:
        notifyError instanceof Error ? notifyError.message : "Unknown error",
    });
  }
}
