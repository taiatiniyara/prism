import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const devValidationBuilderConfig = pgTable(
  "dev_validation_builder_config",
  {
    config_key: text("config_key").primaryKey(),
    config_json: text("config_json").notNull(),
    updated_by_id: text("updated_by_id").references(() => user.id),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
);

export type DevValidationBuilderConfigRow =
  typeof devValidationBuilderConfig.$inferSelect;
export type NewDevValidationBuilderConfigRow =
  typeof devValidationBuilderConfig.$inferInsert;
