import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/pg-core";

/**
 * Migration rejection ledger — one row per source data point that FAILED to load
 * into `data_entries`. Purpose: make the iterative migration diagnosable — for every
 * rejection, WHICH column(s) failed, WHY, and WHAT to do to fix it.
 *
 * Deliberately has NO foreign keys, NO CHECKs, NO NOT-NULLs beyond the PK: an error
 * log must accept anything, or a bad row could be rejected twice (once by the target
 * table, once by the log) and vanish. The full attempted record is preserved in
 * `source_payload` so nothing is ever lost.
 *
 * RESET before every load run: `TRUNCATE migration_rejections RESTART IDENTITY`
 * (see resetRejections() in lib/migration/rejections.ts). Each load starts clean, so
 * the table always reflects exactly the most recent attempt.
 */
export const FAILURE_CATEGORIES = [
  "not_null", // a NOT NULL column (e.g. an unfilled dimension) was null
  "check", // chk_one_value or another CHECK failed
  "unique", // duplicate physical address (uniq_entry_address)
  "fk", // a referenced id does not exist
  "type_cast", // value could not be coerced to the typed column
  "unresolved_ref", // a source label could not be resolved to an id (measure, dim member, period, utility)
  "value_router", // value did not match the measure's data_type routing
  "grain_mismatch", // address grain contradicts the measure's declared agg_level
  "other",
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const migrationRejections = pgTable(
  "migration_rejections",
  {
    id: serial("id").primaryKey().notNull(),
    // The load run this rejection belongs to (migration_loads.id). FK-free on purpose.
    load_id: integer("load_id"),
    // Optional human label for the load attempt (e.g. "2026-07-22-run1").
    load_run: varchar("load_run", { length: 64 }),
    // Source period (p1) — lets the scorecard attribute failures per report_period even
    // when the p2 period didn't resolve.
    p1_report_period_id: integer("p1_report_period_id"),
    // Which pass failed: "shell" (relevance → address) or "value" (typed value fill).
    stage: varchar("stage", { length: 8 }).$type<"shell" | "value">(),
    // Where the source record came from + how to find it again to fix it.
    source_system: varchar("source_system", { length: 64 }),
    source_ref: varchar("source_ref", { length: 255 }),
    // The FULL attempted record — nothing is lost, the fixer sees exactly what was tried.
    source_payload: jsonb("source_payload"),
    // Readable target context (ids kept FK-free on purpose).
    measure_def_id: integer("measure_def_id"),
    measure_name: text("measure_name"),
    report_period: text("report_period"),
    utility: text("utility"),
    // The diagnosis.
    failure_category: varchar("failure_category", {
      length: 32,
    }).$type<FailureCategory>(),
    // The value type this data point was headed for (numeric/boolean/text/option/empty) —
    // lets the scorecard balance FAILED rows by value type, not just in total.
    intended_value_type: varchar("intended_value_type", { length: 16 }),
    // The parsed numeric value of a failed numeric row — so the scorecard's numeric-sum
    // fidelity line (sum_in = sum_migrated + sum_failed) has an INDEPENDENT failed sum
    // and can catch a silently corrupted migrated value (not just a dropped one).
    attempted_numeric: numeric("attempted_numeric"),
    failure_columns: text("failure_columns").array(), // which column(s) failed
    failure_reason: text("failure_reason"), // why, in plain language
    failure_rule: varchar("failure_rule", { length: 128 }), // the constraint/validation id (e.g. chk_one_value, energy_source_id NOT NULL, uniq_entry_address)
    remediation: text("remediation"), // what needs to be done to fix it
    raw_error: text("raw_error"), // the DB/driver error text, if from a caught exception
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_mig_rej_load").on(table.load_id),
    index("idx_mig_rej_category").on(table.failure_category),
    index("idx_mig_rej_measure").on(table.measure_def_id),
  ],
);

export type MigrationRejection = typeof migrationRejections.$inferSelect;
export type NewMigrationRejection = typeof migrationRejections.$inferInsert;
