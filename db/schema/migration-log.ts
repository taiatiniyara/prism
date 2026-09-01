import { pgTable, serial, timestamp, text, boolean, integer } from "drizzle-orm/pg-core";

export const migrationLogs = pgTable("migration_logs", {
  id: serial("id").primaryKey().notNull(),
  run_at: timestamp("run_at").defaultNow().notNull(),
  step_label: text("step_label").notNull(),
  success: boolean("success").notNull(),
  duration_ms: integer("duration_ms").notNull(),
  error_message: text("error_message"),
  records_affected: text("records_affected"),
});

export type MigrationLog = typeof migrationLogs.$inferSelect;
export type NewMigrationLog = typeof migrationLogs.$inferInsert;
