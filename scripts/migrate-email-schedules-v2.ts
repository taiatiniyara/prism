import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  await pool.query(`
    ALTER TABLE email_schedules ADD COLUMN IF NOT EXISTS utility_id integer REFERENCES organisations(id)
  `);
  console.log("Added utility_id to email_schedules");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_send_logs (
      id serial PRIMARY KEY,
      schedule_id integer NOT NULL REFERENCES email_schedules(id) ON DELETE CASCADE,
      recipient_count integer DEFAULT 0 NOT NULL,
      error_count integer DEFAULT 0 NOT NULL,
      sent_by varchar(255),
      sent_at timestamp DEFAULT now() NOT NULL
    )
  `);
  console.log("Created schedule_send_logs");

  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
