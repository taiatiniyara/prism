import nodemailer from "nodemailer";

export type CustomKpiDecisionType = "APPROVE" | "REJECT" | "REPLACE";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

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

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toHtmlMultiline = (value: string): string =>
  escapeHtml(value).replaceAll("\n", "<br />");

const buildCustomKpiEmailLayout = (input: {
  heading: string;
  eyebrow: string;
  accentColor: string;
  intro: string;
  summaryRows: Array<{ label: string; value: string }>;
  note: string;
}) => {
  const summaryRows = input.summaryRows
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
    <div style="margin: 0; padding: 24px 12px; background: #f3f6fb; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #17213a;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 640px; margin: 0 auto; border-collapse: separate; border-spacing: 0; background: #ffffff; border: 1px solid #dce3ef; border-radius: 14px; overflow: hidden;">
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
              Custom KPI Workflow
            </div>
            <p style="margin: 14px 0 0 0; color: #26334d; font-size: 14px; line-height: 1.6;">
              ${escapeHtml(input.intro)}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 24px 12px 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e3e8f2; border-radius: 10px; border-collapse: separate; border-spacing: 0; overflow: hidden;">
              ${summaryRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 4px 24px 22px 24px;">
            <div style="padding: 12px 14px; border-radius: 10px; background: #f7f9fd; border: 1px solid #e3e8f2; color: #3a4a67; font-size: 12px; line-height: 1.6;">
              ${escapeHtml(input.note)}
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
    html: buildCustomKpiEmailLayout({
      heading: `Request ${decisionLabel}`,
      eyebrow: "PRISM Notification",
      accentColor: decisionAccentByType[input.decisionType],
      intro:
        "Your custom KPI request has been reviewed by the PRISM team. See the decision details below.",
      summaryRows: [
        { label: "KPI Title", value: safeTitle },
        { label: "Decision", value: decisionLabel },
        { label: "Reviewer Rationale", value: safeRationale },
      ],
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
    html: buildCustomKpiEmailLayout({
      heading: "New Request Pending Review",
      eyebrow: "PRISM Notification",
      accentColor: "#2563eb",
      intro:
        "A new custom KPI request has been submitted and is ready for DEV review.",
      summaryRows: [
        { label: "KPI Title", value: safeTitle },
        {
          label: "Submitted By",
          value: `${safeSubmitterName} (${safeSubmitterEmail})`,
        },
        {
          label: "Organisation",
          value: safeSubmitterOrganisationAcronym,
        },
      ],
      note: "Open PRISM and navigate to Settings > KPI > Custom KPI Workflow to review and decide on this request.",
    }),
  };
};
