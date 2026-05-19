import "dotenv/config";
import { sendEmail } from "../lib/email.service";

async function main() {
  const testEmail = process.env.TEST_EMAIL || process.env.SMTP_USER;
  if (!testEmail) {
    console.error("Set TEST_EMAIL env var to run the smoke test.");
    process.exit(1);
  }

  console.log("SMTP config:", {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER?.slice(0, 5) + "...",
  });
  console.log(`\nSending test to ${testEmail}...`);

  try {
    await sendEmail({
      to: testEmail,
      subject: "PRISM Smoke Test - Email Schedule Verification",
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>PRISM Email Smoke Test</h2>
        <p>This is a test email to verify the SMTP configuration is working correctly.</p>
        <p>If you received this, the email schedule feature can send emails.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
          <tr style="background:#f1f5f9;">
            <th style="padding:5px 10px;text-align:left;">Test</th>
            <th style="padding:5px 10px;text-align:left;">Status</th>
          </tr>
          <tr>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;">SMTP Connection</td>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;color:green;">OK</td>
          </tr>
          <tr>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;">Email Delivery</td>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;color:green;">OK</td>
          </tr>
        </table>
        <p style="margin-top:16px;color:#64748b;font-size:12px;">This is an automated test from the PRISM platform.</p>
      </div>`,
    });
    console.log("SUCCESS: Email sent successfully.");
  } catch (error) {
    console.error("FAILED:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
