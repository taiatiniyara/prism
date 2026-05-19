import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  const existing = await pool.query(
    `SELECT id FROM sidebar_access WHERE page = '/settings/email-schedules'`,
  );
  if (existing.rows.length > 0) {
    console.log("Already seeded: Email Schedules");
  } else {
    await pool.query(
      `INSERT INTO sidebar_access (id, name, page, roles, "order") VALUES (gen_random_uuid(), 'Email Schedules', '/settings/email-schedules', 'DEV,BMO', 54)`,
    );
    console.log("Seeded: Email Schedules");
  }
  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
