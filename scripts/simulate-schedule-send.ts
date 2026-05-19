import "dotenv/config";
import { Pool } from "pg";
import { sendEmail } from "../lib/email.service";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  const testEmail = process.env.TEST_EMAIL || process.env.SMTP_USER;
  if (!testEmail) {
    console.error("Set TEST_EMAIL or SMTP_USER");
    process.exit(1);
  }

  console.log("=== Simulating BMO Email Schedule Send ===\n");

  const schedules = await pool.query(
    `SELECT * FROM email_schedules WHERE is_active = true ORDER BY id`
  );
  const schedule = schedules.rows[0];
  if (!schedule) {
    console.log("No active schedules.");
    process.exit(0);
  }
  console.log(`Schedule: "${schedule.name}" (${schedule.recipient_role}, ${schedule.frequency})`);

  const role = await pool.query(`SELECT id, name FROM roles WHERE name = $1`, [schedule.recipient_role]);
  const roleId = role.rows[0]?.id;
  console.log(`Target role: ${schedule.recipient_role} (id=${roleId})`);

  const users = await pool.query(
    `SELECT u.id, u.name, u.email, o.acronym as org_name, o.id as org_id
     FROM "user" u
     JOIN organisations o ON u.organisation_id = o.id
     WHERE u.role_id = $1 AND u.status = 'active'
     ORDER BY o.acronym`,
    [roleId]
  );
  console.log(`Recipients: ${users.rows.length} active ${schedule.recipient_role}s\n`);

  const firstUser = users.rows[0];
  if (!firstUser) {
    console.log("No recipients.");
    process.exit(0);
  }

  console.log(`Building summary for: ${firstUser.name} (${firstUser.org_name})`);

  const periods = await pool.query(
    `SELECT rp.id, rp.report_date, mli.name as report_type
     FROM report_periods rp
     LEFT JOIN managed_list_items mli ON rp.report_type_id = mli.id
     WHERE rp.utility_id = $1
     ORDER BY rp.report_date DESC`,
    [firstUser.org_id]
  );

  let totalPending = 0, totalEntered = 0, totalReviewed = 0, totalApproved = 0;
  let summaryRows = "";

  for (const p of periods.rows) {
    const entries = await pool.query(
      `SELECT status_id FROM data_entries
       WHERE report_period_id = $1 AND is_deleted = false AND is_relevant = true`,
      [p.id]
    );

    const pending = entries.rows.filter((e: any) => e.status_id === 2).length;
    const entered = entries.rows.filter((e: any) => e.status_id === 3).length;
    const reviewed = entries.rows.filter((e: any) => e.status_id === 4).length;
    const approved = entries.rows.filter((e: any) => e.status_id === 5).length;
    const total = entries.rows.length;

    totalPending += pending;
    totalEntered += entered;
    totalReviewed += reviewed;
    totalApproved += approved;

    const iso = p.report_date.toISOString().split("T")[0];
    summaryRows += `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;">${iso}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;">${p.report_type || ""}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${total}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${entered}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${reviewed}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${approved}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${pending}</td>
    </tr>`;
  }

  console.log("Data summary:");
  console.log(`  Periods: ${periods.rows.length}`);
  console.log(`  Total entries: ${totalPending + totalEntered + totalReviewed + totalApproved}`);
  console.log(`  Pending: ${totalPending} | Entered: ${totalEntered} | Reviewed: ${totalReviewed} | Approved: ${totalApproved}`);

  const isBLO = schedule.recipient_role === "BLO";
  const highlightBlock = isBLO
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
        <strong style="color:#92400e;">Action Required:</strong>
        <span style="font-size:14px;">${totalPending + totalEntered} data points need your review.</span>
      </div>`
    : `<div style="background:#dbeafe;border:1px solid #3b82f6;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
        <strong style="color:#1e40af;">Action Required:</strong>
        <span style="font-size:14px;">${totalReviewed} reviewed data points need your approval.</span>
      </div>`;

  console.log("\nSending test email...");

  await sendEmail({
    to: testEmail,
    subject: `[TEST] PRISM Data Entry Summary - ${firstUser.org_name}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e293b;">PRISM Data Entry Summary (Test)</h2>
      <p>Hello ${firstUser.name},</p>
      <p>Here is your ${schedule.frequency} data entry summary for <strong>${firstUser.org_name}</strong>:</p>
      ${highlightBlock}
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="padding:5px 10px;text-align:left;">Period</th>
          <th style="padding:5px 10px;text-align:left;">Type</th>
          <th style="padding:5px 10px;">Total</th>
          <th style="padding:5px 10px;">Entered</th>
          <th style="padding:5px 10px;">Reviewed</th>
          <th style="padding:5px 10px;">Approved</th>
          <th style="padding:5px 10px;">Pending</th>
        </tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:12px;">
        This is an automated ${schedule.frequency} summary from the PRISM benchmarking platform.
      </p>
    </div>`,
  });

  console.log("Email sent successfully to:", testEmail);
  console.log("Check inbox for the summary table.");

  await pool.query(
    `INSERT INTO schedule_send_logs (schedule_id, recipient_count, error_count, sent_by)
     VALUES ($1, 1, 0, 'smoke-test')`,
    [schedule.id]
  );
  console.log("Log recorded.");

  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
