import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  const existing = await pool.query(
    `SELECT id, name FROM email_schedules WHERE name = 'Weekly BLO Summary (Test)'`
  );

  if (existing.rows.length > 0) {
    console.log("Test schedule already exists:", existing.rows[0]);
  } else {
    await pool.query(
      `INSERT INTO email_schedules (name, recipient_role, frequency, day_of_week, day_of_month, starts_at, is_active)
       VALUES ('Weekly BLO Summary (Test)', 'BLO', 'weekly', 2, null, now(), true)`
    );
    console.log("Created test schedule: Weekly BLO Summary (Test)");
  }

  const schedules = await pool.query(`SELECT id, name FROM email_schedules`);
  console.log(`\nAll schedules (${schedules.rows.length}):`);
  for (const s of schedules.rows) {
    console.log(`  [${s.id}] ${s.name}`);
  }

  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
