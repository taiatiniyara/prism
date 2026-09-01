CREATE TABLE IF NOT EXISTS "ai_query_request" (
  "request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "user_role" text NOT NULL,
  "prompt_text" text NOT NULL,
  "filter_context" json,
  "session_context_id" text,
  "requested_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_execution_trace" (
  "trace_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "selected_tools" json DEFAULT '[]'::json NOT NULL,
  "latency_ms" integer NOT NULL,
  "status" text NOT NULL,
  "failure_type" text,
  "row_count_returned" integer DEFAULT 0 NOT NULL,
  "retained_until" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ai_execution_trace_request_fk"
    FOREIGN KEY ("request_id") REFERENCES "ai_query_request"("request_id")
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ai_narrative_review" (
  "review_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trace_id" uuid NOT NULL,
  "reviewer_user_id" text NOT NULL,
  "reviewer_role" text NOT NULL,
  "decision" text NOT NULL,
  "rationale" text,
  "reviewed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ai_narrative_review_trace_fk"
    FOREIGN KEY ("trace_id") REFERENCES "ai_execution_trace"("trace_id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_query_request_user_id_idx"
  ON "ai_query_request" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_query_request_requested_at_idx"
  ON "ai_query_request" ("requested_at");
CREATE INDEX IF NOT EXISTS "ai_execution_trace_request_id_idx"
  ON "ai_execution_trace" ("request_id");
CREATE INDEX IF NOT EXISTS "ai_execution_trace_status_idx"
  ON "ai_execution_trace" ("status");
CREATE INDEX IF NOT EXISTS "ai_execution_trace_retained_until_idx"
  ON "ai_execution_trace" ("retained_until");
CREATE INDEX IF NOT EXISTS "ai_narrative_review_trace_id_idx"
  ON "ai_narrative_review" ("trace_id");
CREATE INDEX IF NOT EXISTS "ai_narrative_review_reviewer_user_id_idx"
  ON "ai_narrative_review" ("reviewer_user_id");
