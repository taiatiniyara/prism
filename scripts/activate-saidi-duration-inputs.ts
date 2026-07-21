// Activate the customer-minutes duration inputs so they show in data entry and
// can receive the (re-migrated) source data, making the SAIDI KPIs computable.
// Guarded (only flips inactive->active); idempotent; safe to re-run and on prod.
// Run: node --env-file=.env --import tsx scripts/activate-saidi-duration-inputs.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const IDS = [1802, 1805]; // Total Planned / Unplanned Interruptions Customer Duration

async function main() {
  const before = await pool.query(
    `select id, name, is_active from measure_definitions  where id = any($1::int[]) order by id`,
    [IDS],
  );
  console.log("Before:");
  console.table(before.rows);

  const res = await pool.query(
    `update measure_definitions  set is_active = true, updated_at = now()
     where id = any($1::int[]) and is_active = false`,
    [IDS],
  );
  console.log(`Activated ${res.rowCount} input(s).`);

  const after = await pool.query(
    `select id, name, is_active from measure_definitions  where id = any($1::int[]) order by id`,
    [IDS],
  );
  console.log("After:");
  console.table(after.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
