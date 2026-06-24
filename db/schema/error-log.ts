import {
  pgTable,
  text,
  timestamp,
  serial,
} from "drizzle-orm/pg-core";

export const errorLogs = pgTable("error_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  errorType: text("error_type").notNull(),
  severity: text("severity").notNull().default("error"),
  message: text("message").notNull(),
  stack: text("stack"),
  context: text("context"),
  url: text("url"),
  userId: text("user_id"),
  userEmail: text("user_email"),
  userRole: text("user_role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;
