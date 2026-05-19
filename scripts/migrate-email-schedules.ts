import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  console.log("Dropping time_of_day, adding starts_at and ends_at...");

  await pool.query(`
    ALTER TABLE email_schedules 
      DROP COLUMN IF EXISTS time_of_day,
      ADD COLUMN IF NOT EXISTS starts_at timestamp NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS ends_at timestamp
  `);

  console.log("Done.");
  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
