import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  console.log("=== Email Schedule Diagnostics ===\n");

  const schedules = await pool.query(
    `SELECT es.id, es.name, es.recipient_role, es.frequency, 
            es.day_of_week, es.day_of_month, es.starts_at, es.ends_at,
            es.is_active, es.last_sent_at, es.utility_id,
            o.acronym as utility_name
     FROM email_schedules es
     LEFT JOIN organisations o ON es.utility_id = o.id
     ORDER BY es.created_at`
  );

  if (schedules.rows.length === 0) {
    console.log("No schedules configured. Create one at /settings/email-schedules\n");
  } else {
    for (const s of schedules.rows) {
      const now = new Date();
      const isDue = checkIsDue(s, now);
      console.log(`[${s.id}] "${s.name}"`);
      console.log(`    Role: ${s.recipient_role} | Freq: ${s.frequency} | Active: ${s.is_active}`);
      console.log(`    Utility: ${s.utility_name || "All"} | Day: ${s.day_of_week != null ? `DoW=${s.day_of_week}` : s.day_of_month != null ? `DoM=${s.day_of_month}` : "N/A"}`);
      console.log(`    Window: ${s.starts_at?.toISOString?.() ?? s.starts_at} → ${s.ends_at ?? "ongoing"}`);
      console.log(`    Last sent: ${s.last_sent_at ?? "never"} | Due now: ${isDue ? "YES" : "no"}`);
      console.log("");
    }
  }

  const roles = await pool.query(`SELECT id, name FROM roles WHERE name IN ('BLO', 'CEO')`);
  console.log("--- Role IDs ---");
  for (const r of roles.rows) console.log(`    ${r.name}: id=${r.id}`);

  for (const r of roles.rows) {
    const users = await pool.query(
      `SELECT u.id, u.name, u.email, u.status, o.acronym as org
       FROM "user" u
       JOIN organisations o ON u.organisation_id = o.id
       WHERE u.role_id = $1 AND u.status = 'active'
       ORDER BY o.acronym`,
      [r.id]
    );
    console.log(`\n--- ${r.name} Recipients (${users.rows.length} active) ---`);
    for (const u of users.rows.slice(0, 10)) {
      console.log(`    ${u.org}: ${u.name} <${u.email}>`);
    }
    if (users.rows.length > 10) console.log(`    ... and ${users.rows.length - 10} more`);
  }

  const periods = await pool.query(
    `SELECT rp.id, rp.report_date, o.acronym as utility, mli.name as report_type,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true) as total,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 2) as pending,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 3) as entered,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 4) as reviewed,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 5) as approved
     FROM report_periods rp
     JOIN organisations o ON rp.utility_id = o.id
     LEFT JOIN managed_list_items mli ON rp.report_type_id = mli.id
     ORDER BY rp.report_date DESC
     LIMIT 15`
  );

  console.log(`\n--- Recent Report Periods (${periods.rows.length}) ---`);
  for (const p of periods.rows) {
    const iso = p.report_date?.toISOString?.()?.split("T")[0] ?? p.report_date;
    console.log(`    ${p.utility} | ${iso} | ${p.report_type || "?"} | T:${p.total} E:${p.entered} R:${p.reviewed} A:${p.approved} P:${p.pending}`);
  }

  const logs = await pool.query(
    `SELECT sl.id, sl.schedule_id, es.name as schedule_name, sl.recipient_count, sl.error_count, sl.sent_by, sl.sent_at
     FROM schedule_send_logs sl
     JOIN email_schedules es ON sl.schedule_id = es.id
     ORDER BY sl.sent_at DESC
     LIMIT 10`
  );

  console.log(`\n--- Recent Send Logs (${logs.rows.length}) ---`);
  for (const l of logs.rows) {
    console.log(`    ${l.sent_at?.toISOString?.() ?? l.sent_at} | "${l.schedule_name}" | ${l.recipient_count} sent, ${l.error_count} errors | by ${l.sent_by || "?"}`);
  }

  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function checkIsDue(
  s: {
    frequency: string;
    day_of_week: number | null;
    day_of_month: number | null;
    starts_at: Date | string | null;
    ends_at: Date | string | null;
    last_sent_at: Date | string | null;
  },
  now: Date,
): boolean {
  const startsAt = s.starts_at ? new Date(s.starts_at) : null;
  if (startsAt && now < startsAt) return false;

  const endsAt = s.ends_at ? new Date(s.ends_at) : null;
  if (endsAt && now > endsAt) return false;

  const lastSent = s.last_sent_at ? new Date(s.last_sent_at) : null;

  switch (s.frequency) {
    case "weekly": {
      if (now.getDay() !== (s.day_of_week ?? 0)) return false;
      if (!lastSent) return true;
      return Math.floor((now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24)) >= 7;
    }
    case "monthly": {
      if (now.getDate() !== (s.day_of_month ?? 1)) return false;
      if (!lastSent) return true;
      return now.getMonth() !== lastSent.getMonth() || now.getFullYear() !== lastSent.getFullYear();
    }
    case "quarterly": {
      if (now.getDate() !== (s.day_of_month ?? 1)) return false;
      if (!lastSent) return true;
      const monthsPassed = (now.getFullYear() - lastSent.getFullYear()) * 12 + now.getMonth() - lastSent.getMonth();
      return monthsPassed >= 3;
    }
    case "annually": {
      if (s.starts_at) {
        const anchorMonth = new Date(s.starts_at).getMonth();
        if (now.getMonth() !== anchorMonth) return false;
      }
      if (now.getDate() !== (s.day_of_month ?? 1)) return false;
      if (!lastSent) return true;
      return now.getFullYear() !== lastSent.getFullYear();
    }
    default:
      return false;
  }
}
