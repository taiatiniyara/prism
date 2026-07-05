import nodemailer from "nodemailer";

export type CustomKpiDecisionType = "APPROVE" | "REJECT" | "REPLACE";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP configuration is incomplete.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });
  }

  return { transporter, user } as const;
}

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const { transporter, user } = getTransporter();
  const mailOptions = {
    from: `"PRISM - PPA Benchmarking Platform" <${user}>`,
    to: options.to,
    subject: options.subject,
    html: options.html || "",
  };
  await transporter.sendMail(mailOptions);
}

const decisionLabelByType: Record<CustomKpiDecisionType, string> = {
  APPROVE: "Approved",
  REJECT: "Rejected",
  REPLACE: "Replaced",
};

const decisionAccentByType: Record<CustomKpiDecisionType, string> = {
  APPROVE: "#0f766e",
  REJECT: "#b91c1c",
  REPLACE: "#7c3aed",
};

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toHtmlMultiline = (value: string): string =>
  escapeHtml(value).replaceAll("\n", "<br />");

const buildSummaryRowsTable = (
  rows: Array<{ label: string; value: string }>,
): string => {
  const summaryRows = rows
    .map(
      (row) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e3e8f2; width: 180px; color: #4f5d75; font-size: 13px; font-weight: 600; vertical-align: top;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e3e8f2; color: #17213a; font-size: 13px; line-height: 1.5; vertical-align: top;">
            ${toHtmlMultiline(row.value)}
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e3e8f2; border-radius: 10px; border-collapse: separate; border-spacing: 0; overflow: hidden;">
      ${summaryRows}
    </table>
  `;
};

const buildPrismEmailLayout = (input: {
  heading: string;
  eyebrow: string;
  accentColor: string;
  sectionLabel?: string;
  introText: string;
  bodyText: string;
  note: string;
}) => {
  return `
    <div style="margin: 0; padding: 24px 12px; background: #f3f6fb; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #17213a;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 640px; margin: 0 auto; border-collapse: separate; border-spacing: 0; background: #ffffff; border: 1px solid #dce3ef; border-radius: 14px; overflow: hidden;">
        <tr>
          <td style="padding: 16px 24px; background: #0f172a; text-align: center;">
            <img src="${process.env.EMAIL_LOGO_URL || process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/logo.png` : "https://prismdashboard.org/logo.png"}" alt="PRISM logo" width="140" style="display: block; height: auto; margin: 0 auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding: 0; background: linear-gradient(120deg, #1f2a44 0%, #304e7a 100%);">
            <div style="padding: 18px 24px 10px 24px; color: #eaf1ff; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700;">
              ${escapeHtml(input.eyebrow)}
            </div>
            <div style="padding: 0 24px 20px 24px; color: #ffffff; font-size: 24px; line-height: 1.25; font-weight: 700;">
              ${escapeHtml(input.heading)}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 24px 8px 24px;">
            <div style="display: inline-block; padding: 5px 10px; border-radius: 999px; background: ${input.accentColor}; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;">
              ${escapeHtml(input.sectionLabel || "PRISM Notification")}
            </div>
            <p style="margin: 14px 0 0 0; color: #26334d; font-size: 14px; line-height: 1.6;">
              ${input.introText}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 24px 12px 24px;">
            ${input.bodyText}
          </td>
        </tr>
        <tr>
          <td style="padding: 4px 24px 22px 24px;">
            <div style="padding: 12px 14px; border-radius: 10px; background: #f7f9fd; border: 1px solid #e3e8f2; color: #3a4a67; font-size: 12px; line-height: 1.6;">
              ${toHtmlMultiline(input.note)}
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
};

export const buildCustomKpiReviewOutcomeEmail = (input: {
  title: string;
  decisionType: CustomKpiDecisionType;
  rationale: string;
}): { subject: string; html: string } => {
  const decisionLabel = decisionLabelByType[input.decisionType];
  const safeTitle = input.title.trim();
  const safeRationale = input.rationale.trim();

  return {
    subject: `Custom KPI Review Outcome: ${decisionLabel}`,
    html: buildPrismEmailLayout({
      heading: `Request ${decisionLabel}`,
      eyebrow: "PRISM Notification",
      accentColor: decisionAccentByType[input.decisionType],
      sectionLabel: "Custom KPI Workflow",
      introText:
        "Your custom KPI request has been reviewed by the PRISM team. See the decision details below.",
      bodyText: buildSummaryRowsTable([
        { label: "KPI Title", value: safeTitle },
        { label: "Decision", value: decisionLabel },
        { label: "Reviewer Rationale", value: safeRationale },
      ]),
      note: "You can view current request status in PRISM under Settings > KPI > Custom KPI Workflow.",
    }),
  };
};

export const buildCustomKpiSubmissionReviewEmail = (input: {
  title: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterOrganisationAcronym: string | null;
}): { subject: string; html: string } => {
  const safeTitle = input.title.trim();
  const safeSubmitterName = input.submitterName?.trim() || "Unknown user";
  const safeSubmitterEmail = input.submitterEmail?.trim() || "Unknown email";
  const safeSubmitterOrganisationAcronym =
    input.submitterOrganisationAcronym?.trim() || "Unknown organisation";

  return {
    subject: "New Custom KPI Request Pending Review",
    html: buildPrismEmailLayout({
      heading: "New Request Pending Review",
      eyebrow: "PRISM Notification",
      accentColor: "#2563eb",
      sectionLabel: "Custom KPI Workflow",
      introText:
        "A new custom KPI request has been submitted and is ready for DEV review.",
      bodyText: buildSummaryRowsTable([
        { label: "KPI Title", value: safeTitle },
        {
          label: "Submitted By",
          value: `${safeSubmitterName} (${safeSubmitterEmail})`,
        },
        {
          label: "Organisation",
          value: safeSubmitterOrganisationAcronym,
        },
      ]),
      note: "Open PRISM and navigate to Settings > KPI > Custom KPI Workflow to review and decide on this request.",
    }),
  };
};

export const buildRegistrationClarificationEmail = (input: {
  requesterName: string;
  subject: string;
  clarificationMessage: string;
  referenceTag?: string;
}): { subject: string; html: string } => {
  const safeRequesterName = input.requesterName.trim() || "Requester";
  const safeSubject = input.subject.trim() || "Clarification Required";
  const safeMessage = input.clarificationMessage.trim();
  const safeReferenceTag = input.referenceTag?.trim() || "";

  return {
    subject: `PRISM Registration Clarification: ${safeSubject}${safeReferenceTag ? ` ${safeReferenceTag}` : ""}`,
    html: buildPrismEmailLayout({
      heading: "Clarification Required",
      eyebrow: "PRISM Registration",
      accentColor: "#0f766e",
      sectionLabel: "Registration Review",
      introText: `Dear ${escapeHtml(safeRequesterName)},<br /><br />Your PRISM registration request is currently under review. Please provide clarification on the following:`,
      bodyText: buildSummaryRowsTable([
        { label: "Subject", value: safeSubject },
        { label: "Clarification", value: safeMessage },
      ]),
      note: `You can reply directly to this email, and the PRISM team will log your response as part of your registration review record.${safeReferenceTag ? `\n\nReference: ${safeReferenceTag}` : ""}`,
    }),
  };
};

export const buildMagicLinkEmail = (input: {
  url: string;
}): { subject: string; html: string } => {
  const safeUrl = escapeHtml(input.url.trim());

  return {
    subject: "Your Magic Login Link",
    html: buildPrismEmailLayout({
      heading: "Welcome to PRISM",
      eyebrow: "Secure Sign In",
      accentColor: "#1e293b",
      sectionLabel: "Authentication",
      introText:
        "Hello,<br /><br />To complete your login and gain access to the platform, please use the secure link below.",
      bodyText: `
        <div style="padding: 24px; border: 1px solid #e3e8f2; border-radius: 10px; text-align: center; background: #ffffff;">
          <a href="${safeUrl}" style="display: inline-block; background: #1e293b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Verify My Email</a>
          <p style="margin: 16px 0 0 0; color: #4b5563; font-size: 13px; line-height: 1.6;">This link expires in <strong>15 minutes</strong> for security reasons.</p>
        </div>
      `,
      note: "If you did not request this link, you can safely ignore this email.",
    }),
  };
};
