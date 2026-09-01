"use server";

import { sendEmail } from "@/lib/email/email.service";
import { db } from "@/db/connection";
import { user } from "@/db/schema/auth-schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/user.service";

interface SendBmoEmailInput {
  subject: string;
  message: string;
  utilityId: number | null;
}

export async function sendBmoEmail(
  input: SendBmoEmailInput,
): Promise<{ success: boolean; message: string }> {
  const currentUser = await getCurrentUser();

  if (!currentUser.role || (currentUser.role !== "BMO" && currentUser.role !== "DEV")) {
    return { success: false, message: "Only BMO/DEV users can send emails." };
  }

  try {
    const userWhere = [eq(user.status, "active")];

    if (input.utilityId) {
      userWhere.push(eq(user.organisation_id, input.utilityId));
    }

    const recipients = await db
      .select({
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(and(...userWhere));

    if (recipients.length === 0) {
      return { success: false, message: "No active recipients found." };
    }

    let sent = 0;
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient.email,
          subject: input.subject,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <p>Dear ${recipient.name},</p>
              <div style="white-space: pre-line;">${input.message}</div>
              <hr style="margin-top: 20px; border: none; border-top: 1px solid #e2e8f0;" />
              <p style="color: #64748b; font-size: 12px;">
                Kind Regards,<br />The PRISM Team
              </p>
            </div>
          `,
        });
        sent++;
      } catch {
        continue;
      }
    }

    return {
      success: true,
      message: `Email sent to ${sent} recipient${sent !== 1 ? "s" : ""}.`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send email.",
    };
  }
}
