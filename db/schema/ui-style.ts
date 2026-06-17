import {
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

/**
 * App-wide DEV styling overrides (see components/dev/dev-design-mode.tsx).
 * A single "global" row holds a map of CSS-selector -> curated style props.
 * Editable only by DEV; applied for all users.
 */
export type UiElementStyle = {
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  fontSize?: number;
  fontWeight?: number;
  padding?: number;
};

// Keyed by a (sanitised) CSS selector.
export type UiStyleMap = Record<string, UiElementStyle>;

export const uiStyleOverride = pgTable(
  "ui_style_override",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    scope: varchar("scope", { length: 32 }).notNull().default("global"),
    styles: json("styles").$type<UiStyleMap>().notNull().default({}),
    updated_by_id: text("updated_by_id").references(() => user.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ui_style_override_scope_idx").on(table.scope)],
);

export type UiStyleOverride = typeof uiStyleOverride.$inferSelect;
export type NewUiStyleOverride = typeof uiStyleOverride.$inferInsert;
