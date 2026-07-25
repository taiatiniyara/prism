import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Migration load registry. One row per load RUN — its `id` is the auto-incrementing
 * **load_id** stamped onto every `migration_rejections` and `migration_scorecard` row
 * for that run. Created by startLoad() (lib/migration/loads.ts) as the first step of a
 * load; `started_at` is the run timestamp, `finished_at`/`status` closed by finishLoad().
 *
 * This is what makes load_id auto-increment: inserting a row assigns the next serial id,
 * so the run number climbs 1, 2, 3, … across loads even though the rejection ledger is
 * truncated each run.
 */
export type MigrationLoadStatus = "running" | "completed" | "failed";

export const migrationLoads = pgTable("migration_loads", {
  id: serial("id").primaryKey().notNull(), // = load_id (auto-increment per run)
  label: varchar("label", { length: 64 }),
  source_system: varchar("source_system", { length: 64 }),
  status: varchar("status", { length: 16 })
    .$type<MigrationLoadStatus>()
    .default("running")
    .notNull(),
  rows_in: integer("rows_in"), // total source rows taken in (summary convenience)
  rows_migrated: integer("rows_migrated"),
  rows_failed: integer("rows_failed"),
  started_at: timestamp("started_at").notNull().defaultNow(),
  finished_at: timestamp("finished_at"),
  notes: text("notes"),
});

export type MigrationLoad = typeof migrationLoads.$inferSelect;
export type NewMigrationLoad = typeof migrationLoads.$inferInsert;
