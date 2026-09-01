import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { organisations } from "./utility";

export const emailSchedules = pgTable("email_schedules", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  recipient_role: varchar("recipient_role", { length: 50 }).notNull(),
  frequency: varchar("frequency", { length: 20 }).notNull(),
  day_of_week: integer("day_of_week"),
  day_of_month: integer("day_of_month"),
  starts_at: timestamp("starts_at").notNull().defaultNow(),
  ends_at: timestamp("ends_at"),
  utility_id: integer("utility_id").references(() => organisations.id),
  is_active: boolean("is_active").default(true).notNull(),
  last_sent_at: timestamp("last_sent_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});

export type EmailSchedule = typeof emailSchedules.$inferSelect & {
  utility_name?: string | null;
};
export type NewEmailSchedule = typeof emailSchedules.$inferInsert;

export const scheduleSendLogs = pgTable("schedule_send_logs", {
  id: serial("id").primaryKey().notNull(),
  schedule_id: integer("schedule_id")
    .notNull()
    .references(() => emailSchedules.id, { onDelete: "cascade" }),
  recipient_count: integer("recipient_count").default(0).notNull(),
  error_count: integer("error_count").default(0).notNull(),
  sent_by: varchar("sent_by", { length: 255 }),
  sent_at: timestamp("sent_at").defaultNow().notNull(),
});

export type ScheduleSendLog = typeof scheduleSendLogs.$inferSelect;
export type NewScheduleSendLog = typeof scheduleSendLogs.$inferInsert;
