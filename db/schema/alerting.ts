import {
  pgTable,
  text,
  timestamp,
  serial,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  severityFilter: text("severity_filter"),
  threshold: jsonb("threshold"),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const alertHistory = pgTable("alert_history", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  message: text("message").notNull(),
  dispatched: boolean("dispatched").notNull().default(false),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
