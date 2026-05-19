import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

const entries = [
  { name: "Sub-Regions", page: "/settings/sub-regions", roles: "DEV,BMO", order: 50 },
  { name: "Report Periods", page: "/settings/report-periods", roles: "DEV,BMO", order: 51 },
  { name: "Country Context", page: "/settings/country-context", roles: "DEV,BMO", order: 52 },
  { name: "External Registrations", page: "/settings/external-registrations", roles: "DEV,BMO", order: 53 },
  { name: "Incomplete KPIs", page: "/data-entry/incomplete-kpis", roles: "DEV,BMO", order: 30 },
  { name: "Review Feedback", page: "/data-entry/review-feedback", roles: "DEV,BMO", order: 31 },
  { name: "Downloads", page: "/data-entry/downloads", roles: "DEV,BMO", order: 32 },
];

(async () => {
  for (const entry of entries) {
    const existing = await pool.query(
      `SELECT id FROM sidebar_access WHERE page = $1`,
      [entry.page],
    );
    if (existing.rows.length > 0) {
      console.log(`Skipped (exists): ${entry.name}`);
      continue;
    }
    await pool.query(
      `INSERT INTO sidebar_access (id, name, page, roles, "order") VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [entry.name, entry.page, entry.roles, entry.order],
    );
    console.log(`Seeded: ${entry.name}`);
  }
  console.log("Done");
  await pool.end();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
