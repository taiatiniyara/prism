import {
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export type AiRole = "DEV" | "BMO" | "BLO" | "CEO";
export type AiExecutionStatus =
  | "SUCCESS"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "PARTIAL_FAILURE"
  | "NO_DATA"
  | "POLICY_BYPASS";
export type AiNarrativeDecision = "APPROVED" | "REJECTED";
export type AiNarrativeApproverRole = "DEV" | "BMO";

export const aiQueryRequests = pgTable(
  "ai_query_request",
  {
    request_id: uuid("request_id").primaryKey().notNull().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id),
    user_role: text("user_role").$type<AiRole>().notNull(),
    prompt_text: text("prompt_text").notNull(),
    filter_context: json("filter_context").$type<Record<
      string,
      unknown
    > | null>(),
    session_context_id: text("session_context_id"),
    requested_at: timestamp("requested_at").notNull().defaultNow(),
  },
  (table) => [
    index("ai_query_request_user_id_idx").on(table.user_id),
    index("ai_query_request_requested_at_idx").on(table.requested_at),
  ],
);

export const aiExecutionTraces = pgTable(
  "ai_execution_trace",
  {
    trace_id: uuid("trace_id").primaryKey().notNull().defaultRandom(),
    request_id: uuid("request_id")
      .notNull()
      .references(() => aiQueryRequests.request_id, { onDelete: "cascade" }),
    selected_tools: json("selected_tools")
      .$type<string[]>()
      .notNull()
      .default([]),
    latency_ms: integer("latency_ms").notNull(),
    status: text("status").$type<AiExecutionStatus>().notNull(),
    failure_type: text("failure_type"),
    row_count_returned: integer("row_count_returned").notNull().default(0),
    retained_until: timestamp("retained_until").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ai_execution_trace_request_id_idx").on(table.request_id),
    index("ai_execution_trace_status_idx").on(table.status),
    index("ai_execution_trace_retained_until_idx").on(table.retained_until),
  ],
);

export const aiNarrativeReviews = pgTable(
  "ai_narrative_review",
  {
    review_id: uuid("review_id").primaryKey().notNull().defaultRandom(),
    trace_id: uuid("trace_id")
      .notNull()
      .references(() => aiExecutionTraces.trace_id, { onDelete: "cascade" }),
    reviewer_user_id: text("reviewer_user_id")
      .notNull()
      .references(() => user.id),
    reviewer_role: text("reviewer_role")
      .$type<AiNarrativeApproverRole>()
      .notNull(),
    decision: text("decision").$type<AiNarrativeDecision>().notNull(),
    rationale: text("rationale"),
    reviewed_at: timestamp("reviewed_at").notNull().defaultNow(),
  },
  (table) => [
    index("ai_narrative_review_trace_id_idx").on(table.trace_id),
    index("ai_narrative_review_reviewer_user_id_idx").on(
      table.reviewer_user_id,
    ),
  ],
);

export type AiQueryRequest = typeof aiQueryRequests.$inferSelect;
export type NewAiQueryRequest = typeof aiQueryRequests.$inferInsert;

export type AiExecutionTrace = typeof aiExecutionTraces.$inferSelect;
export type NewAiExecutionTrace = typeof aiExecutionTraces.$inferInsert;

export type AiNarrativeReview = typeof aiNarrativeReviews.$inferSelect;
export type NewAiNarrativeReview = typeof aiNarrativeReviews.$inferInsert;
