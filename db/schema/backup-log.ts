import {
  pgTable,
  text,
  timestamp,
  serial,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const backupLogs = pgTable("backup_logs", {
  id: serial("id").primaryKey(),
  fileSizeBytes: integer("file_size_bytes"),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BackupLog = typeof backupLogs.$inferSelect;
