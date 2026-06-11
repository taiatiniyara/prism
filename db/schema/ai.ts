import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  serial,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export type AiChatRole = "user" | "assistant" | "system";
export type AiToolCallStatus = "pending" | "success" | "error" | "timeout";
export type AiFeedbackSentiment = "positive" | "negative";
export type AiReviewDecision = "approved" | "rejected" | "needs_revision";

export const aiChatSession = pgTable(
  "ai_chat_session",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    context_summary: jsonb("context_summary").$type<AiSessionContext>(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    last_turn_at: timestamp("last_turn_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (table) => [
    index("ai_chat_session_user_last_turn_idx").on(
      table.user_id,
      table.last_turn_at,
    ),
    index("ai_chat_session_user_deleted_idx").on(
      table.user_id,
      table.deleted_at,
    ),
  ],
);

export interface AiSessionContext {
  utility_id?: string | null;
  utility_name?: string | null;
  report_period_id?: number | null;
  topics_discussed?: string[];
  key_findings?: string[];
}

export const aiChatTurn = pgTable(
  "ai_chat_turn",
  {
    id: serial("id").primaryKey(),
    session_id: integer("session_id")
      .notNull()
      .references(() => aiChatSession.id, { onDelete: "cascade" }),
    turn_number: integer("turn_number").notNull(),
    user_message: text("user_message").notNull(),
    assistant_response: text("assistant_response"),
    model_used: text("model_used"),
    model_was_fallback: boolean("model_was_fallback").default(false),
    prompt_version: text("prompt_version"),
    token_count_input: integer("token_count_input"),
    token_count_output: integer("token_count_output"),
    latency_ms: integer("latency_ms"),
    error_message: text("error_message"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_chat_turn_session_turn_idx").on(
      table.session_id,
      table.turn_number,
    ),
    index("ai_chat_turn_created_idx").on(table.created_at),
  ],
);

export const aiToolCall = pgTable(
  "ai_tool_call",
  {
    id: serial("id").primaryKey(),
    turn_id: integer("turn_id")
      .notNull()
      .references(() => aiChatTurn.id, { onDelete: "cascade" }),
    tool_name: text("tool_name").notNull(),
    tool_args: jsonb("tool_args").notNull(),
    tool_result: jsonb("tool_result"),
    status: text("status")
      .notNull()
      .$type<AiToolCallStatus>()
      .default("pending"),
    error_message: text("error_message"),
    latency_ms: integer("latency_ms"),
    data_freshness: timestamp("data_freshness"),
    data_completeness_pct: integer("data_completeness_pct"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_tool_call_turn_idx").on(table.turn_id),
    index("ai_tool_call_tool_name_idx").on(table.tool_name),
    index("ai_tool_call_status_idx").on(table.status),
  ],
);

export const aiFeedback = pgTable(
  "ai_feedback",
  {
    id: serial("id").primaryKey(),
    turn_id: integer("turn_id")
      .notNull()
      .references(() => aiChatTurn.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sentiment: text("sentiment").notNull().$type<AiFeedbackSentiment>(),
    correction_text: text("correction_text"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_feedback_turn_idx").on(table.turn_id),
    index("ai_feedback_user_idx").on(table.user_id),
    index("ai_feedback_sentiment_idx").on(table.sentiment),
  ],
);

export const aiReviewQueue = pgTable(
  "ai_review_queue",
  {
    id: serial("id").primaryKey(),
    turn_id: integer("turn_id")
      .notNull()
      .references(() => aiChatTurn.id, { onDelete: "cascade" }),
    flagged_reason: text("flagged_reason"),
    flagged_by_feedback_id: integer("flagged_by_feedback_id").references(
      () => aiFeedback.id,
      { onDelete: "set null" },
    ),
    reviewer_user_id: text("reviewer_user_id").references(() => user.id),
    decision: text("decision").$type<AiReviewDecision>(),
    decision_rationale: text("decision_rationale"),
    reviewed_at: timestamp("reviewed_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_review_queue_turn_idx").on(table.turn_id),
    index("ai_review_queue_decision_idx").on(table.decision),
  ],
);

export const aiUsageMetrics = pgTable(
  "ai_usage_metrics",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    request_count: integer("request_count").notNull().default(0),
    token_count: integer("token_count").notNull().default(0),
    tool_call_count: integer("tool_call_count").notNull().default(0),
    error_count: integer("error_count").notNull().default(0),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_usage_metrics_user_date_idx").on(table.user_id, table.date),
    (t) => ({ unq: t.unique().on(table.user_id, table.date) }),
  ],
);

export const aiBenchmark = pgTable(
  "ai_benchmark",
  {
    id: serial("id").primaryKey(),
    kpi_name: text("kpi_name").notNull().unique(),
    category: text("category").notNull(),
    description: text("description"),
    unit: text("unit").notNull(),
    direction: text("direction").notNull().$type<"lower_is_better" | "higher_is_better">(),
    developing_nation_benchmark: integer("developing_nation_benchmark"),
    developed_nation_benchmark: integer("developed_nation_benchmark"),
    pacific_regional_average: integer("pacific_regional_average"),
    ppa_target: integer("ppa_target"),
    source: text("source"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("ai_benchmark_kpi_name_idx").on(table.kpi_name),
    index("ai_benchmark_category_idx").on(table.category),
  ],
);

export const aiChatSessionRelations = relations(aiChatSession, ({ many }) => ({
  turns: many(aiChatTurn),
}));

export const aiChatTurnRelations = relations(aiChatTurn, ({ one, many }) => ({
  session: one(aiChatSession, {
    fields: [aiChatTurn.session_id],
    references: [aiChatSession.id],
  }),
  toolCalls: many(aiToolCall),
  feedback: many(aiFeedback),
  reviewItems: many(aiReviewQueue),
}));

export const aiToolCallRelations = relations(aiToolCall, ({ one }) => ({
  turn: one(aiChatTurn, {
    fields: [aiToolCall.turn_id],
    references: [aiChatTurn.id],
  }),
}));

export const aiFeedbackRelations = relations(aiFeedback, ({ one }) => ({
  turn: one(aiChatTurn, {
    fields: [aiFeedback.turn_id],
    references: [aiChatTurn.id],
  }),
}));

export const aiReviewQueueRelations = relations(aiReviewQueue, ({ one }) => ({
  turn: one(aiChatTurn, {
    fields: [aiReviewQueue.turn_id],
    references: [aiChatTurn.id],
  }),
}));

export type AiChatSession = typeof aiChatSession.$inferSelect;
export type NewAiChatSession = typeof aiChatSession.$inferInsert;
export type AiChatTurn = typeof aiChatTurn.$inferSelect;
export type NewAiChatTurn = typeof aiChatTurn.$inferInsert;
export type AiToolCall = typeof aiToolCall.$inferSelect;
export type NewAiToolCall = typeof aiToolCall.$inferInsert;
export type AiFeedback = typeof aiFeedback.$inferSelect;
export type NewAiFeedback = typeof aiFeedback.$inferInsert;
export type AiReviewQueue = typeof aiReviewQueue.$inferSelect;
export type NewAiReviewQueue = typeof aiReviewQueue.$inferInsert;
export type AiUsageMetrics = typeof aiUsageMetrics.$inferSelect;
export type NewAiUsageMetrics = typeof aiUsageMetrics.$inferInsert;
export type AiBenchmark = typeof aiBenchmark.$inferSelect;
export type NewAiBenchmark = typeof aiBenchmark.$inferInsert;
