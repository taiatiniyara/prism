// Read-only debug: why does resolveInputs see no candidates?
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const flags = await pool.query(`
    select input_def_id, is_relevant, is_deleted, count(*)::int as rows,
           count(*) filter (where customer_type_id is not null
                               or payment_mode_id is not null)::int as with_ct_pm
    from data_entries
    where input_def_id in (1501, 1800, 1803, 1652, 1659)
      and value is not null and trim(value) <> ''
    group by 1, 2, 3 order by 1, 2
  `);
  console.table(flags.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
