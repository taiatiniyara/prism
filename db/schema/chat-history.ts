import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export type PersistedChatRole = "user" | "assistant";

export const chatSessions = pgTable(
  "chat_session",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull().default("New chat"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    last_message_at: timestamp("last_message_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_session_user_last_message_idx").on(
      table.user_id,
      table.last_message_at,
    ),
  ],
);

export const chatMessages = pgTable(
  "chat_message",
  {
    id: serial("id").primaryKey(),
    session_id: integer("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").$type<PersistedChatRole>().notNull(),
    content: text("content").notNull(),
    model: text("model"),
    capabilities_used: text("capabilities_used"),
    recommended_view: text("recommended_view"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_message_session_created_idx").on(
      table.session_id,
      table.created_at,
    ),
  ],
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
