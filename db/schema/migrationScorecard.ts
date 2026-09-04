import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Migration scorecard — the load-balance report, keyed PER (load_id × report_period).
 * Each period reconciles on its own (sub-totals at report_period grain), so errors that
 * would cancel out in a grand total can't hide.
 *
 * Two stages per period, each a set of lines with the three phases source / migrated / failed:
 *   - SHELL   : relevance records → data_entries shells      (relevance = created + failed)
 *   - VALUE   : typed values fill shells, by value_type      (values_in = migrated + failed)
 *   - VALUE_SUM: Σ value_numeric fidelity                    (sum_in = sum_migrated + sum_failed)
 *   - LEAK    : p1 non-calc values with no relevance record  (unfiltered − matched = orphans)
 *   - FILL    : empty shells (informational)                 (relevance − filled)
 *   - EXCLUDED: calculated values dropped by RAW-ONLY (info)
 *
 * `variance` = source − migrated − failed and `is_balanced` are GENERATED. `balance_expected`
 * marks the lines where variance≠0 is a real anomaly (shell/value/value_sum/leak) vs the
 * informational lines (fill/excluded). Anomaly report = balance_expected AND NOT is_balanced.
 *
 * source side = the p1 control-totals sheet; migrated side = data_entries; failed side =
 * migration_rejections. The source count is computed independently in p1, so a silently
 * dropped row breaks the balance instead of vanishing from both sides.
 */
export const SCORECARD_LINES = [
  "shell",
  "value",
  "value_sum",
  "leak",
  "fill", // raw shells awaiting entry (informational)
  "calc_shell", // calculated shells awaiting p2 computation (informational)
  "excluded",
] as const;
export type ScorecardLine = (typeof SCORECARD_LINES)[number];

export const SCORECARD_VALUE_TYPES = [
  "numeric",
  "boolean",
  "text",
  "option",
  "total",
  "na",
] as const;
export type ScorecardValueType = (typeof SCORECARD_VALUE_TYPES)[number];

export const migrationScorecard = pgTable(
  "migration_scorecard",
  {
    id: serial("id").primaryKey().notNull(),
    load_id: integer("load_id").notNull(),
    p1_report_period_id: integer("p1_report_period_id").notNull(),
    report_period_id: integer("report_period_id"), // p2 resolved (nullable if unmapped)
    period_label: varchar("period_label", { length: 64 }),
    recon_line: varchar("recon_line", { length: 16 })
      .$type<ScorecardLine>()
      .notNull(),
    value_type: varchar("value_type", { length: 16 })
      .$type<ScorecardValueType>()
      .notNull()
      .default("na"),
    source: numeric("source").notNull().default("0"), // p1 control total
    migrated: numeric("migrated").notNull().default("0"), // landed in data_entries
    failed: numeric("failed").notNull().default("0"), // recorded in migration_rejections
    // Generated: exact (numeric) balance. On anomaly lines, variance≠0 = investigate.
    variance: numeric("variance").generatedAlwaysAs(
      sql`((source - migrated) - failed)`,
    ),
    // True on lines where variance≠0 is a real anomaly (not the informational fill/excluded).
    balance_expected: boolean("balance_expected").generatedAlwaysAs(
      sql`((recon_line)::text = ANY ((ARRAY['shell'::character varying, 'value'::character varying, 'value_sum'::character varying, 'leak'::character varying])::text[]))`,
    ),
    is_balanced: boolean("is_balanced").generatedAlwaysAs(
      sql`(source = (migrated + failed))`,
    ),
    note: text("note"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("uq_scorecard").on(
      table.load_id,
      table.p1_report_period_id,
      table.recon_line,
      table.value_type,
    ),
    index("idx_scorecard_load").on(table.load_id),
  ],
);

export type MigrationScorecard = typeof migrationScorecard.$inferSelect;
export type NewMigrationScorecard = typeof migrationScorecard.$inferInsert;
