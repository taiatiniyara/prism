import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fiscalYearForReportPeriod } from "@/lib/legacy/legacy-dl-resolver";

/**
 * Parity guard: the SQL function `fiscal_year_for_report_period` (scripts/sql/
 * 2026-09-02-measure-strata-history.sql) MUST agree with the TS helper
 * fiscalYearForReportPeriod for every real report period. The relevance engine
 * (lib/relevance/expected.ts) resolves effective-dated grain against the SQL
 * function; the fact/label layer uses the TS helper. If they drift, the same
 * period gets two fiscal years — the second-source-of-time-truth bug the H1 fix
 * (6504e7e) retired. This test is the lock (#8's required review condition on PR #257).
 *
 * DB-guarded: runs wherever DATABASE_URL is set (local / any DB-wired env), skips
 * in the mock-only CI lane. Applies the shipping migration in a transaction and
 * ROLLS BACK — leaves the DB untouched.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("fiscal_year_for_report_period ≡ fiscalYearForReportPeriod", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = await pool.connect();
    await client.query("BEGIN");
    // apply the real shipping migration (table + both functions + seed), minus its
    // own BEGIN/COMMIT — everything here is rolled back in afterAll.
    const sql = readFileSync(
      path.join(process.cwd(), "scripts/sql/2026-09-02-measure-strata-history.sql"),
      "utf8",
    )
      .replace(/^\s*BEGIN;\s*$/m, "")
      .replace(/^\s*COMMIT;\s*$/m, "");
    await client.query(sql);
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    if (pool) await pool.end();
  });

  it("agrees for every report period (all report types × FYE variants)", async () => {
    const { rows } = await client.query<{
      id: number;
      d: string;
      y: number;
      mo: number;
      da: number;
      report_type: string | null;
      fm: number | null;
      fd: number | null;
      sql_fy: number | null;
    }>(`
      SELECT rp.id,
             to_char(rp.report_date::date, 'YYYY-MM-DD') AS d,
             EXTRACT(year  FROM rp.report_date)::int AS y,
             EXTRACT(month FROM rp.report_date)::int AS mo,
             EXTRACT(day   FROM rp.report_date)::int AS da,
             (SELECT name FROM managed_list_items WHERE id = rp.report_type_id) AS report_type,
             o.fye_month AS fm, o.fye_day AS fd,
             fiscal_year_for_report_period(
               rp.report_date::date,
               (SELECT name FROM managed_list_items WHERE id = rp.report_type_id),
               o.fye_month, o.fye_day
             ) AS sql_fy
      FROM report_periods rp
      JOIN organisations o ON o.id = rp.utility_id`);

    expect(rows.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const r of rows) {
      // build the TS input from explicit calendar components (matches SQL EXTRACT,
      // no UTC/local skew) — new Date(y, mo-1, da) is local midnight on that date.
      const tsFy = fiscalYearForReportPeriod(
        new Date(r.y, r.mo - 1, r.da),
        r.report_type,
        r.fm,
        r.fd,
      );
      if (r.sql_fy !== tsFy) {
        mismatches.push(
          `period ${r.id} date=${r.d} type=${r.report_type} fye=${r.fm}/${r.fd}: sql=${r.sql_fy} ts=${tsFy}`,
        );
      }
    }
    expect(mismatches, `\n${mismatches.join("\n")}`).toEqual([]);
  });
});
