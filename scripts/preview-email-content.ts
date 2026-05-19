import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  console.log("=== Global Data Entry Progress (what the email will show) ===\n");

  const periods = await pool.query(
    `SELECT rp.id, rp.report_date, o.acronym as utility, mli.name as report_type,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true) as total,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 2) as pending,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 3) as entered,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 4) as reviewed,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 5) as approved,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 6) as endorsed,
            (SELECT COUNT(*) FROM data_entries de WHERE de.report_period_id = rp.id AND de.is_deleted = false AND de.is_relevant = true AND de.status_id = 7) as not_available
     FROM report_periods rp
     JOIN organisations o ON rp.utility_id = o.id
     LEFT JOIN managed_list_items mli ON rp.report_type_id = mli.id
     ORDER BY o.acronym, rp.report_date DESC`
  );

  let grandEntered = 0, grandReviewed = 0, grandApproved = 0, grandEndorsed = 0, grandPending = 0, grandNA = 0;

  for (const p of periods.rows) {
    const iso = p.report_date?.toISOString?.()?.slice(0, 10) ?? String(p.report_date).slice(0, 10);
    grandEntered += Number(p.entered);
    grandReviewed += Number(p.reviewed);
    grandApproved += Number(p.approved);
    grandEndorsed += Number(p.endorsed);
    grandPending += Number(p.pending);
    grandNA += Number(p.not_available);
    console.log(`${p.utility?.padEnd(8)} | ${iso} | ${(p.report_type || "").padEnd(16)} | T:${String(p.total).padStart(3)} E:${String(p.entered).padStart(3)} R:${String(p.reviewed).padStart(3)} A:${String(p.approved).padStart(3)} En:${String(p.endorsed).padStart(3)} P:${String(p.pending).padStart(3)} N/A:${String(p.not_available).padStart(3)}`);
  }

  const utilityCount = new Set(periods.rows.map((r: any) => r.utility)).size;
  console.log(`\n--- Totals across ${utilityCount} utilities, ${periods.rows.length} periods ---`);
  console.log(`Entered: ${grandEntered} | Reviewed: ${grandReviewed} | Approved: ${grandApproved} | Endorsed: ${grandEndorsed} | Pending: ${grandPending} | N/A: ${grandNA}`);

  const schedules = await pool.query(`SELECT id, name, recipient_role, frequency FROM email_schedules WHERE is_active = true`);
  if (schedules.rows.length > 0) {
    const s = schedules.rows[0];
    const isBLO = s.recipient_role === "BLO";
    console.log(`\n--- Email would show for "${s.name}" (${s.recipient_role}) ---`);
    if (isBLO) {
      console.log(`Banner: "${grandPending + grandEntered} data points need review across all utilities."`);
    } else {
      console.log(`Banner: "${grandReviewed} reviewed data points need approval across all utilities."`);
    }
    console.log(`Recipients: 38 active BLOs / 16 active CEOs`);
  }

  await pool.end();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
