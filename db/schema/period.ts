import {
  check,
  date,
  integer,
  pgTable,
  serial,
  smallint,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Canonical time-axis dimension (kpi-time-series-spec §3) — decoupled from submissions.
// FY buckets are shared across utilities with the same FY-end; `fy_year` is the FY-START-year
// label (matches fiscalYearForReportPeriod / fiscal_year_for_report_period). Only kind
// 'financial_year' is live; 'month'/'quarter' modelled but dormant (§6).
// Applied to p2 via scripts/sql/2026-09-21-period-dimension-*.sql (git-first; model added
// after apply, drift-check errors on model-ahead-of-DB). #8 signed off the FY semantics.
export const period = pgTable(
  "period",
  {
    id: serial("id").primaryKey().notNull(),
    kind: varchar("kind", { length: 16 }).notNull(), // financial_year | month | quarter
    fy_year: integer("fy_year"), // FY start-year label; FY buckets only
    fy_end_month: smallint("fy_end_month"), // 1-12; FY buckets only
    fy_end_day: smallint("fy_end_day"), // 1-31; FY buckets only (distinguishes e.g. Jun-15 vs Jun-30)
    period_start: date("period_start").notNull(),
    period_end: date("period_end").notNull(),
    label: varchar("label", { length: 32 }).notNull(),
  },
  (t) => ({
    kindCheck: check(
      "chk_period_kind",
      sql`${t.kind} IN ('financial_year', 'month', 'quarter')`,
    ),
    fyEndMonthCheck: check(
      "chk_period_fy_end_month",
      sql`${t.fy_end_month} IS NULL OR ${t.fy_end_month} BETWEEN 1 AND 12`,
    ),
    fyEndDayCheck: check(
      "chk_period_fy_end_day",
      sql`${t.fy_end_day} IS NULL OR ${t.fy_end_day} BETWEEN 1 AND 31`,
    ),
    // An FY bucket is uniquely identified by (fy_year, fye_month, fye_day).
    uniqFy: unique("uniq_period_fy").on(
      t.kind,
      t.fy_year,
      t.fy_end_month,
      t.fy_end_day,
    ),
  }),
);
export type Period = typeof period.$inferSelect;
export type NewPeriod = typeof period.$inferInsert;
