import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { kpiDefinitions } from "./kpi";
import { managedListItems } from "./managedLists";

export type CustomKpiRequestStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REPLACED";

export type CustomKpiVisibilityScope = "SUBMITTER_ONLY" | "GLOBAL";

export type CustomKpiDecisionType = "APPROVE" | "REJECT" | "REPLACE";

export type CustomKpiLifecycleEventType =
  | "REQUEST_SUBMITTED"
  | "DECISION_APPROVED"
  | "DECISION_REJECTED"
  | "DECISION_REPLACED"
  | "DECISION_OVERRIDDEN"
  | "VISIBILITY_PROMOTED"
  | "EMAIL_DISPATCHED"
  | "EMAIL_DISPATCH_FAILED";

export type CustomKpiEmailDeliveryStatus =
  | "PENDING"
  | "SENT"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL";

export type CustomKpiProposedUnit = {
  name: string;
  description?: string | null;
};

export type CustomKpiProposedInput = {
  name: string;
  description?: string | null;
  unit: string;
  dataType: string;
};

export const customKpiRequests = pgTable(
  "custom_kpi_request",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    submitter_user_id: text("submitter_user_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    description: text("description"),
    formula_expression: text("formula_expression").notNull(),
    is_private: boolean("is_private").notNull().default(false),
    unit_id: integer("unit_id").references(() => managedListItems.id),
    proposed_units: json("proposed_units")
      .$type<CustomKpiProposedUnit[]>()
      .notNull()
      .default([]),
    proposed_inputs: json("proposed_inputs")
      .$type<CustomKpiProposedInput[]>()
      .notNull()
      .default([]),
    selected_input_definition_ids: json("selected_input_definition_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    definition_fingerprint: text("definition_fingerprint").notNull(),
    status: text("status")
      .$type<CustomKpiRequestStatus>()
      .notNull()
      .default("PENDING_REVIEW"),
    visibility_scope: text("visibility_scope")
      .$type<CustomKpiVisibilityScope>()
      .notNull()
      .default("SUBMITTER_ONLY"),
    replacement_kpi_def_id: integer("replacement_kpi_def_id").references(
      () => kpiDefinitions.id,
    ),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("custom_kpi_request_submitter_idx").on(table.submitter_user_id),
    index("custom_kpi_request_status_idx").on(table.status),
    index("custom_kpi_request_fingerprint_idx").on(
      table.submitter_user_id,
      table.definition_fingerprint,
      table.status,
    ),
  ],
);

export type CustomKpiRequest = typeof customKpiRequests.$inferSelect;
export type NewCustomKpiRequest = typeof customKpiRequests.$inferInsert;

export const customKpiDecisions = pgTable(
  "custom_kpi_decision",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    request_id: uuid("request_id")
      .notNull()
      .references(() => customKpiRequests.id, { onDelete: "cascade" }),
    reviewer_user_id: text("reviewer_user_id")
      .notNull()
      .references(() => user.id),
    decision_type: text("decision_type")
      .$type<CustomKpiDecisionType>()
      .notNull(),
    rationale: text("rationale").notNull(),
    override_of_decision_id: uuid("override_of_decision_id"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("custom_kpi_decision_request_idx").on(table.request_id),
    index("custom_kpi_decision_reviewer_idx").on(table.reviewer_user_id),
  ],
);

export type CustomKpiDecision = typeof customKpiDecisions.$inferSelect;
export type NewCustomKpiDecision = typeof customKpiDecisions.$inferInsert;

export const customKpiLifecycleEvents = pgTable(
  "custom_kpi_lifecycle_event",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    request_id: uuid("request_id")
      .notNull()
      .references(() => customKpiRequests.id, { onDelete: "cascade" }),
    event_type: text("event_type")
      .$type<CustomKpiLifecycleEventType>()
      .notNull(),
    actor_user_id: text("actor_user_id").references(() => user.id),
    metadata_json: json("metadata_json").$type<Record<
      string,
      unknown
    > | null>(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("custom_kpi_lifecycle_request_idx").on(table.request_id)],
);

export type CustomKpiLifecycleEvent =
  typeof customKpiLifecycleEvents.$inferSelect;

export const customKpiEmailDeliveries = pgTable(
  "custom_kpi_email_delivery",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    request_id: uuid("request_id")
      .notNull()
      .references(() => customKpiRequests.id, { onDelete: "cascade" }),
    decision_id: uuid("decision_id")
      .notNull()
      .references(() => customKpiDecisions.id, { onDelete: "cascade" }),
    recipient_email: text("recipient_email").notNull(),
    delivery_status: text("delivery_status")
      .$type<CustomKpiEmailDeliveryStatus>()
      .notNull()
      .default("PENDING"),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error: text("last_error"),
    next_attempt_at: timestamp("next_attempt_at"),
    sent_at: timestamp("sent_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("custom_kpi_email_delivery_request_idx").on(table.request_id),
    index("custom_kpi_email_delivery_status_idx").on(table.delivery_status),
  ],
);

export type CustomKpiEmailDelivery =
  typeof customKpiEmailDeliveries.$inferSelect;
