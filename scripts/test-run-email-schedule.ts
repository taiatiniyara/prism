import "dotenv/config";
import { Pool } from "pg";
import { sendEmail } from "../lib/email.service";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  const testEmail = process.env.TEST_EMAIL || process.env.SMTP_USER;
  if (!testEmail) throw new Error("Set TEST_EMAIL or SMTP_USER");

  console.log("=== BMO Email Schedule — Test Run ===\n");

  const schedules = await pool.query(
    `SELECT * FROM email_schedules WHERE is_active = true ORDER BY id`
  );

  if (schedules.rows.length === 0) {
    console.log("No schedules found. Skipping.");
    process.exit(0);
  }

  const s = schedules.rows[0];
  console.log(`Schedule: "${s.name}" | ${s.recipient_role} | ${s.frequency}`);

  const role = await pool.query(`SELECT id FROM roles WHERE name = $1`, [s.recipient_role]);
  const roleId = role.rows[0]?.id;
  const userCount = await pool.query(
    `SELECT COUNT(*) FROM "user" WHERE role_id = $1 AND status = 'active'`,
    [roleId]
  );
  console.log(`Recipients: ${userCount.rows[0].count} active ${s.recipient_role}s\n`);

  console.log("Gathering global data...");

  const periods = await pool.query(
    `SELECT rp.report_date, o.acronym as utility, mli.name as report_type,
      (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true) as total,
      (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 2) as pending,
      (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 3) as entered,
      (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 4) as reviewed,
      (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 5) as approved,
      (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 6) as endorsed
     FROM report_periods rp
     JOIN organisations o ON rp.utility_id = o.id
     LEFT JOIN managed_list_items mli ON rp.report_type_id = mli.id
     ORDER BY o.acronym, rp.report_date DESC`
  );

  let grandEntered = 0, grandReviewed = 0, grandApproved = 0, grandEndorsed = 0, grandPending = 0;
  let tableRows = "";

  for (const p of periods.rows) {
    const iso = new Date(p.report_date).toISOString().slice(0, 10);
    grandEntered += Number(p.entered);
    grandReviewed += Number(p.reviewed);
    grandApproved += Number(p.approved);
    grandEndorsed += Number(p.endorsed);
    grandPending += Number(p.pending);

    tableRows += `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${p.utility}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${iso}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${p.report_type || ""}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.total}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.entered}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.reviewed}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.approved}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.endorsed}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.pending}</td>
    </tr>`;
  }

  const utilityCount = new Set(periods.rows.map((r: any) => r.utility)).size;
  const isBLO = s.recipient_role === "BLO";
  const highlightBlock = isBLO
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
        <strong style="color:#92400e;">Action Required:</strong>
        <span style="font-size:14px;">${grandPending + grandEntered} data points need review across all utilities.</span>
      </div>`
    : `<div style="background:#dbeafe;border:1px solid #3b82f6;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
        <strong style="color:#1e40af;">Action Required:</strong>
        <span style="font-size:14px;">${grandReviewed} reviewed data points need approval across all utilities.</span>
      </div>`;

  console.log(`  ${utilityCount} utilities | ${periods.rows.length} periods`);
  console.log(`  Entered: ${grandEntered} | Pending: ${grandPending} | Total: ${grandEntered + grandReviewed + grandApproved + grandEndorsed + grandPending}`);
  console.log(`\nSending test email to ${testEmail}...`);

  await sendEmail({
    to: testEmail,
    subject: `[TEST] PRISM Data Entry Summary — ${utilityCount} Utilities`,
    html: `<div style="font-family:sans-serif;max-width:900px;margin:0 auto;">
      <h2 style="color:#1e293b;">PRISM Data Entry Summary</h2>
      <p>Here is the ${s.frequency} data entry progress report across all utilities:</p>
      ${highlightBlock}
      <p style="margin:4px 0;color:#64748b;font-size:13px;">
        Totals — ${utilityCount} utilities — Entered: ${grandEntered} | Reviewed: ${grandReviewed} | Approved: ${grandApproved} | Endorsed: ${grandEndorsed} | Pending: ${grandPending}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="padding:4px 8px;text-align:left;">Utility</th>
          <th style="padding:4px 8px;text-align:left;">Period</th>
          <th style="padding:4px 8px;text-align:left;">Type</th>
          <th style="padding:4px 8px;">Total</th>
          <th style="padding:4px 8px;">Entered</th>
          <th style="padding:4px 8px;">Reviewed</th>
          <th style="padding:4px 8px;">Approved</th>
          <th style="padding:4px 8px;">Endorsed</th>
          <th style="padding:4px 8px;">Pending</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:12px;">
        This is an automated ${s.frequency} summary from the PRISM benchmarking platform.
      </p>
    </div>`,
  });

  await pool.query(
    `INSERT INTO schedule_send_logs (schedule_id, recipient_count, error_count, sent_by) VALUES ($1, 1, 0, 'test-run')`,
    [s.id]
  );

  console.log("SUCCESS — email delivered to:", testEmail);
  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
