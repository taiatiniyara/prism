import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic app-wide key/value settings, editable by DEV. One row per setting.
 * First use: `ai_primary_source` = 'webapp' | 'powerbi' (which source the AI
 * treats as primary; the other is automatically the secondary/fallback).
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_by: text("updated_by"),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
