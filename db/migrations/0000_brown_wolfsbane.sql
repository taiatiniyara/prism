CREATE TABLE "ai_benchmark" (
	"id" serial PRIMARY KEY NOT NULL,
	"kpi_name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"unit" text NOT NULL,
	"direction" text NOT NULL,
	"developing_nation_benchmark" integer,
	"developed_nation_benchmark" integer,
	"pacific_regional_average" integer,
	"ppa_target" integer,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_benchmark_kpi_name_unique" UNIQUE("kpi_name")
);
--> statement-breakpoint
CREATE TABLE "ai_chat_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"context_summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_turn_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_chat_turn" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"turn_number" integer NOT NULL,
	"user_message" text NOT NULL,
	"assistant_response" text,
	"model_used" text,
	"model_was_fallback" boolean DEFAULT false,
	"prompt_version" text,
	"token_count_input" integer,
	"token_count_output" integer,
	"latency_ms" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_cost_budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"daily_limit_cents" integer DEFAULT 500 NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_cost_budget_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ai_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"turn_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"sentiment" text NOT NULL,
	"correction_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_rate_limit_window" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"window_type" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"turn_id" integer NOT NULL,
	"flagged_reason" text,
	"flagged_by_feedback_id" integer,
	"reviewer_user_id" text,
	"decision" text,
	"decision_rationale" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_call" (
	"id" serial PRIMARY KEY NOT NULL,
	"turn_id" integer NOT NULL,
	"tool_name" text NOT NULL,
	"tool_args" jsonb NOT NULL,
	"tool_result" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"latency_ms" integer,
	"data_freshness" timestamp,
	"data_completeness_pct" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"token_count_input" integer DEFAULT 0,
	"token_count_output" integer DEFAULT 0,
	"estimated_cost_cents" integer DEFAULT 0,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_metrics_user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"message" text NOT NULL,
	"dispatched" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"severity_filter" text,
	"threshold" jsonb,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"actor_role" text,
	"target_type" text NOT NULL,
	"target_id" text,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"organisation" text NOT NULL,
	"dataset_required" text,
	"data_access_reason" text,
	"date_created" timestamp DEFAULT now() NOT NULL,
	"status_id" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" integer,
	"role_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"date_approved" timestamp,
	"date_rejected" timestamp,
	"rejected_by_user_id" text,
	"dataset_required" text,
	"data_access_reason" text,
	"reject_reason" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_registration_clarification_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"direction" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"received_from_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_status_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"decision_type" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_size_bytes" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmarking_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"benchmark_utility_id" integer NOT NULL,
	"requesting_utility_id" integer NOT NULL,
	"decision_type_id" integer NOT NULL,
	"decision_by_id" integer,
	"decision_date" timestamp,
	"request_expiry" timestamp
);
--> statement-breakpoint
CREATE TABLE "bsc_initiative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"specific_objective_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" varchar(16) DEFAULT 'initiative' NOT NULL,
	"start_date" date,
	"target_completion_date" date,
	"status" varchar(16),
	"ord" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_kpi_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"initiative_id" uuid NOT NULL,
	"kpi_def_id" integer,
	"pending_custom_kpi_request_id" uuid,
	"ord" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_kpi_target_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"kpi_def_id" integer NOT NULL,
	"frequency" text,
	"start_date" date,
	"periods" json DEFAULT '[]'::json NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_objective_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"relation" varchar(16) DEFAULT 'drives' NOT NULL,
	"note" text,
	"ord" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_specific_objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"lever_node_id" uuid NOT NULL,
	"description" text NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_template_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"relation" varchar(16) DEFAULT 'drives' NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_template_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"level" text NOT NULL,
	"label" text NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"map_label" text,
	"is_map_node" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_theme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(32) DEFAULT 'global' NOT NULL,
	"styles" json DEFAULT '{}'::json NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsc_utility_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"template_node_id" uuid,
	"parent_node_id" uuid,
	"level" text NOT NULL,
	"label" text,
	"ord" integer DEFAULT 0 NOT NULL,
	"map_label" text,
	"is_map_node" boolean,
	"map_x" integer,
	"map_y" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"dial_code" varchar(10) NOT NULL,
	"iso_code_alpha2" varchar NOT NULL,
	"iso_code_alpha3" varchar NOT NULL,
	"currency_id" integer NOT NULL,
	"is_adb_member" boolean DEFAULT true NOT NULL,
	"sub_region_id" integer NOT NULL,
	"updated_date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_context" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"dl_def_id" integer NOT NULL,
	"source_date" timestamp,
	"source_doc" varchar(500),
	"source_url" varchar(500),
	"value" varchar(1000),
	"updated_by" varchar(255),
	"updated_date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"un_continental_region" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_kpi_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"decision_type" text NOT NULL,
	"rationale" text NOT NULL,
	"override_of_decision_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_kpi_email_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"delivery_status" text DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_kpi_lifecycle_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"metadata_json" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_kpi_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"formula_expression" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"unit_id" integer,
	"proposed_units" json DEFAULT '[]'::json NOT NULL,
	"proposed_inputs" json DEFAULT '[]'::json NOT NULL,
	"selected_input_definition_ids" json DEFAULT '[]'::json NOT NULL,
	"definition_fingerprint" text NOT NULL,
	"status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"visibility_scope" text DEFAULT 'SUBMITTER_ONLY' NOT NULL,
	"replacement_kpi_def_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_period_id" integer NOT NULL,
	"energy_resource_id" integer,
	"service_area_id" integer,
	"measure_def_id" integer NOT NULL,
	"value" varchar(255),
	"comments" json,
	"update_medium_id" integer,
	"status_id" integer,
	"is_relevant" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"energy_provider_id" integer,
	"energy_source_id" integer,
	"customer_type_id" integer,
	"payment_mode_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
CREATE TABLE "data_entry_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_entry_id" uuid NOT NULL,
	"previous_value" varchar(255) NOT NULL,
	"new_value" varchar(255) NOT NULL,
	"updated_by_id" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measure_definitions " (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"variable_name" varchar(255),
	"formula" text,
	"formula_inputs" json,
	"category_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"service_group_id" integer,
	"unit_id" integer NOT NULL,
	"data_type_id" integer NOT NULL,
	"valid_polarity_id" integer,
	"valid_trend_id" integer,
	"valid_range_min" integer,
	"valid_range_max" integer,
	"is_descriptive" boolean DEFAULT false NOT NULL,
	"utility_service_id" integer,
	"is_currency" boolean DEFAULT false NOT NULL,
	"is_aggregated" boolean DEFAULT false NOT NULL,
	"agg_level_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"is_system_generated" boolean DEFAULT false NOT NULL,
	"is_calculated" boolean DEFAULT false NOT NULL,
	"is_kpi" boolean DEFAULT false NOT NULL,
	"is_kpi_input" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"alternative_names" json,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "input_dl_def_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"measure_def_id" integer NOT NULL,
	"training_dl_def_id" bigint NOT NULL,
	"training_dl_legacy_id" varchar(64) NOT NULL,
	"training_source_id" integer,
	"training_dl_name" varchar(255) NOT NULL,
	"training_variable_name" varchar(255),
	"score" integer DEFAULT 0 NOT NULL,
	"confidence" varchar(16) NOT NULL,
	"reasons" json,
	"is_auto" boolean DEFAULT false NOT NULL,
	"is_approved" boolean DEFAULT true NOT NULL,
	"approved_at" timestamp,
	"approved_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "input_relevance" (
	"id" serial PRIMARY KEY NOT NULL,
	"measure_def_id" integer NOT NULL,
	"dimension_id" integer NOT NULL,
	"is_relevant" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_relevance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_period_id" integer NOT NULL,
	"service_area_id" integer NOT NULL,
	"measure_def_id" integer NOT NULL,
	"payment_mode_id" integer NOT NULL,
	"customer_type_id" integer NOT NULL,
	"is_relevant" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
CREATE TABLE "transmission_relevance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_period_id" integer NOT NULL,
	"service_area_id" integer NOT NULL,
	"measure_def_id" integer NOT NULL,
	"is_relevant" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
CREATE TABLE "dev_validation_builder_config" (
	"config_key" text PRIMARY KEY NOT NULL,
	"config_json" text NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"recipient_role" varchar(50) NOT NULL,
	"frequency" varchar(20) NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp,
	"utility_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_send_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"sent_by" varchar(255),
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"error_type" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" text,
	"url" text,
	"user_id" text,
	"user_email" text,
	"user_role" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "governance_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"dl_def_id" integer NOT NULL,
	"utility_id" integer NOT NULL,
	"value" varchar(255),
	"updated_by" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "utility_context_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"dl_def_id" integer NOT NULL,
	"utility_id" integer NOT NULL,
	"value" varchar(255),
	"report_period_id" integer,
	"updated_by" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bsc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"perspective" json,
	"relationships" json,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_period_id" serial NOT NULL,
	"kpi_def_id" serial NOT NULL,
	"target_value" varchar(255),
	"actual_value" varchar(255) NOT NULL,
	"comments" varchar(255),
	"is_relevant" boolean DEFAULT true NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"calculation_formula_version" varchar(255),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_calculation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"source_data_entry_id" uuid NOT NULL,
	"kpi_def_id" integer,
	"report_period_id" integer NOT NULL,
	"scope" json NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"formula_version" varchar(255) DEFAULT 'unspecified' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"failure_reason" text,
	"failure_type" varchar(32),
	"deferred_follow_up" boolean DEFAULT false NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"formula" varchar,
	"formula_inputs" json,
	"category_id" integer DEFAULT 515 NOT NULL,
	"subcategory_id" integer DEFAULT 600,
	"agg_level_id" integer DEFAULT 1 NOT NULL,
	"is_aggregated" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"unit_id" integer DEFAULT 91 NOT NULL,
	"block" integer DEFAULT 60,
	"is_currency" boolean DEFAULT false NOT NULL,
	"is_descriptive" boolean DEFAULT false NOT NULL,
	"utility_ids" json,
	"owner_utility_id" integer,
	"type" varchar DEFAULT 'benchmarking' NOT NULL,
	"limits" json,
	"targets" json,
	"is_kpi_input" boolean DEFAULT true NOT NULL,
	"owner_user_id" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_target_trajectory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" integer NOT NULL,
	"kpi_def_id" integer NOT NULL,
	"trajectory" varchar(16) NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_resource_type_relevance" (
	"id" serial PRIMARY KEY NOT NULL,
	"energy_resource_type_id" integer NOT NULL,
	"energy_type_id" integer NOT NULL,
	"energy_source_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"parent_id" integer,
	"energy_resource_type_id" integer,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"color" varchar DEFAULT '#EE32DD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"step_label" text NOT NULL,
	"success" boolean NOT NULL,
	"duration_ms" integer NOT NULL,
	"error_message" text,
	"records_affected" text
);
--> statement-breakpoint
CREATE TABLE "report_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"utility_id" integer NOT NULL,
	"report_type_id" integer NOT NULL,
	"report_date" timestamp NOT NULL,
	"request_date" timestamp NOT NULL,
	"status_id" integer,
	"who_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sidebar_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"page" text NOT NULL,
	"roles" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_style_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(32) DEFAULT 'global' NOT NULL,
	"styles" json DEFAULT '{}'::json NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_aggregated" boolean DEFAULT false NOT NULL,
	"resource_qty" integer,
	"power_station_id" integer,
	"service_area_id" integer NOT NULL,
	"utility_id" integer NOT NULL,
	"energy_provider_id" integer NOT NULL,
	"energy_type_id" integer NOT NULL,
	"energy_source_id" integer NOT NULL,
	"type_id" integer DEFAULT 1 NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"agg_level_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"acronym" varchar(255),
	"country_id" integer NOT NULL,
	"is_utility" boolean DEFAULT false NOT NULL,
	"powerquality_standard_id" integer,
	"electricity_regulation_id" integer,
	"accounting_standard_id" integer,
	"entity_type_id" integer,
	"utility_type_id" integer,
	"operating_basis_id" integer,
	"ppa_membership_type_id" integer,
	"utility_size_id" integer,
	"services_provided_id" integer,
	"financial_year_end" varchar(255),
	"is_mth_report_relevant" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_date" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "power_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"service_area_id" integer NOT NULL,
	"utility_id" integer NOT NULL,
	"commissioned_date" varchar(255),
	"decommissioned_date" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"utility_id" integer NOT NULL,
	"provides_electricity" boolean DEFAULT true NOT NULL,
	"provides_sanitation" boolean DEFAULT false NOT NULL,
	"provides_water" boolean DEFAULT false NOT NULL,
	"operations_only" boolean DEFAULT false,
	"report_periods" jsonb NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"agg_level_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_session" ADD CONSTRAINT "ai_chat_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_turn" ADD CONSTRAINT "ai_chat_turn_session_id_ai_chat_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_cost_budget" ADD CONSTRAINT "ai_cost_budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_turn_id_ai_chat_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."ai_chat_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_queue" ADD CONSTRAINT "ai_review_queue_turn_id_ai_chat_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."ai_chat_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_queue" ADD CONSTRAINT "ai_review_queue_flagged_by_feedback_id_ai_feedback_id_fk" FOREIGN KEY ("flagged_by_feedback_id") REFERENCES "public"."ai_feedback"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_queue" ADD CONSTRAINT "ai_review_queue_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_call" ADD CONSTRAINT "ai_tool_call_turn_id_ai_chat_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."ai_chat_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_metrics" ADD CONSTRAINT "ai_usage_metrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_registration_clarification_message" ADD CONSTRAINT "user_registration_clarification_message_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_registration_clarification_message" ADD CONSTRAINT "user_registration_clarification_message_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_status_event" ADD CONSTRAINT "user_status_event_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_status_event" ADD CONSTRAINT "user_status_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarking_request" ADD CONSTRAINT "benchmarking_request_benchmark_utility_id_organisations_id_fk" FOREIGN KEY ("benchmark_utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarking_request" ADD CONSTRAINT "benchmarking_request_requesting_utility_id_organisations_id_fk" FOREIGN KEY ("requesting_utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarking_request" ADD CONSTRAINT "benchmarking_request_decision_type_id_managed_list_items_id_fk" FOREIGN KEY ("decision_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_initiative" ADD CONSTRAINT "bsc_initiative_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_initiative" ADD CONSTRAINT "bsc_initiative_specific_objective_id_bsc_specific_objective_id_fk" FOREIGN KEY ("specific_objective_id") REFERENCES "public"."bsc_specific_objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_link" ADD CONSTRAINT "bsc_kpi_link_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_link" ADD CONSTRAINT "bsc_kpi_link_initiative_id_bsc_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."bsc_initiative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_link" ADD CONSTRAINT "bsc_kpi_link_kpi_def_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_def_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_link" ADD CONSTRAINT "bsc_kpi_link_pending_custom_kpi_request_id_custom_kpi_request_id_fk" FOREIGN KEY ("pending_custom_kpi_request_id") REFERENCES "public"."custom_kpi_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_target_plan" ADD CONSTRAINT "bsc_kpi_target_plan_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_target_plan" ADD CONSTRAINT "bsc_kpi_target_plan_kpi_def_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_def_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_kpi_target_plan" ADD CONSTRAINT "bsc_kpi_target_plan_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_objective_link" ADD CONSTRAINT "bsc_objective_link_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_objective_link" ADD CONSTRAINT "bsc_objective_link_source_node_id_bsc_utility_node_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."bsc_utility_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_objective_link" ADD CONSTRAINT "bsc_objective_link_target_node_id_bsc_utility_node_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."bsc_utility_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_specific_objective" ADD CONSTRAINT "bsc_specific_objective_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_specific_objective" ADD CONSTRAINT "bsc_specific_objective_lever_node_id_bsc_utility_node_id_fk" FOREIGN KEY ("lever_node_id") REFERENCES "public"."bsc_utility_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_template_link" ADD CONSTRAINT "bsc_template_link_source_node_id_bsc_template_node_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."bsc_template_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_template_link" ADD CONSTRAINT "bsc_template_link_target_node_id_bsc_template_node_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."bsc_template_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_template_node" ADD CONSTRAINT "bsc_template_node_parent_id_bsc_template_node_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."bsc_template_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_theme" ADD CONSTRAINT "bsc_theme_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_utility_node" ADD CONSTRAINT "bsc_utility_node_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_utility_node" ADD CONSTRAINT "bsc_utility_node_template_node_id_bsc_template_node_id_fk" FOREIGN KEY ("template_node_id") REFERENCES "public"."bsc_template_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc_utility_node" ADD CONSTRAINT "bsc_utility_node_parent_node_id_bsc_utility_node_id_fk" FOREIGN KEY ("parent_node_id") REFERENCES "public"."bsc_utility_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_currency_id_managed_list_items_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_sub_region_id_sub_regions_id_fk" FOREIGN KEY ("sub_region_id") REFERENCES "public"."sub_regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_context" ADD CONSTRAINT "country_context_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_context" ADD CONSTRAINT "country_context_dl_def_id_managed_list_items_id_fk" FOREIGN KEY ("dl_def_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_decision" ADD CONSTRAINT "custom_kpi_decision_request_id_custom_kpi_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."custom_kpi_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_decision" ADD CONSTRAINT "custom_kpi_decision_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_email_delivery" ADD CONSTRAINT "custom_kpi_email_delivery_request_id_custom_kpi_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."custom_kpi_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_email_delivery" ADD CONSTRAINT "custom_kpi_email_delivery_decision_id_custom_kpi_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."custom_kpi_decision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_lifecycle_event" ADD CONSTRAINT "custom_kpi_lifecycle_event_request_id_custom_kpi_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."custom_kpi_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_lifecycle_event" ADD CONSTRAINT "custom_kpi_lifecycle_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_request" ADD CONSTRAINT "custom_kpi_request_submitter_user_id_user_id_fk" FOREIGN KEY ("submitter_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_request" ADD CONSTRAINT "custom_kpi_request_unit_id_managed_list_items_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_kpi_request" ADD CONSTRAINT "custom_kpi_request_replacement_kpi_def_id_kpi_definitions_id_fk" FOREIGN KEY ("replacement_kpi_def_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_report_period_id_report_periods_id_fk" FOREIGN KEY ("report_period_id") REFERENCES "public"."report_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_energy_resource_id_energy_resources_id_fk" FOREIGN KEY ("energy_resource_id") REFERENCES "public"."energy_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_input_def_id_input_definitions_id_fk" FOREIGN KEY ("measure_def_id") REFERENCES "public"."measure_definitions "("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_update_medium_id_managed_list_items_id_fk" FOREIGN KEY ("update_medium_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_energy_provider_id_managed_list_items_id_fk" FOREIGN KEY ("energy_provider_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_energy_source_id_managed_list_items_id_fk" FOREIGN KEY ("energy_source_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_customer_type_id_managed_list_items_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_payment_mode_id_managed_list_items_id_fk" FOREIGN KEY ("payment_mode_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entry_logs" ADD CONSTRAINT "data_entry_logs_data_entry_id_data_entries_id_fk" FOREIGN KEY ("data_entry_id") REFERENCES "public"."data_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entry_logs" ADD CONSTRAINT "data_entry_logs_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_category_id_managed_list_items_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_subcategory_id_managed_list_items_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_service_group_id_managed_list_items_id_fk" FOREIGN KEY ("service_group_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_unit_id_managed_list_items_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_data_type_id_managed_list_items_id_fk" FOREIGN KEY ("data_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_valid_polarity_id_managed_list_items_id_fk" FOREIGN KEY ("valid_polarity_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_valid_trend_id_managed_list_items_id_fk" FOREIGN KEY ("valid_trend_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_utility_service_id_managed_list_items_id_fk" FOREIGN KEY ("utility_service_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_definitions " ADD CONSTRAINT "input_definitions_agg_level_id_managed_list_items_id_fk" FOREIGN KEY ("agg_level_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_dl_def_mappings" ADD CONSTRAINT "input_dl_def_mappings_input_def_id_input_definitions_id_fk" FOREIGN KEY ("measure_def_id") REFERENCES "public"."measure_definitions "("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_dl_def_mappings" ADD CONSTRAINT "input_dl_def_mappings_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_relevance" ADD CONSTRAINT "input_relevance_input_def_id_input_definitions_id_fk" FOREIGN KEY ("measure_def_id") REFERENCES "public"."measure_definitions "("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_relevance" ADD CONSTRAINT "input_relevance_dimension_id_managed_list_items_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."managed_list_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_relevance" ADD CONSTRAINT "tariff_relevance_report_period_id_report_periods_id_fk" FOREIGN KEY ("report_period_id") REFERENCES "public"."report_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_relevance" ADD CONSTRAINT "tariff_relevance_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_relevance" ADD CONSTRAINT "tariff_relevance_input_def_id_input_definitions_id_fk" FOREIGN KEY ("measure_def_id") REFERENCES "public"."measure_definitions "("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_relevance" ADD CONSTRAINT "tariff_relevance_payment_mode_id_managed_list_items_id_fk" FOREIGN KEY ("payment_mode_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_relevance" ADD CONSTRAINT "tariff_relevance_customer_type_id_managed_list_items_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_relevance" ADD CONSTRAINT "tariff_relevance_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmission_relevance" ADD CONSTRAINT "transmission_relevance_report_period_id_report_periods_id_fk" FOREIGN KEY ("report_period_id") REFERENCES "public"."report_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmission_relevance" ADD CONSTRAINT "transmission_relevance_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmission_relevance" ADD CONSTRAINT "transmission_relevance_input_def_id_input_definitions_id_fk" FOREIGN KEY ("measure_def_id") REFERENCES "public"."measure_definitions "("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmission_relevance" ADD CONSTRAINT "transmission_relevance_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev_validation_builder_config" ADD CONSTRAINT "dev_validation_builder_config_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_schedules" ADD CONSTRAINT "email_schedules_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_send_logs" ADD CONSTRAINT "schedule_send_logs_schedule_id_email_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."email_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_data" ADD CONSTRAINT "governance_data_dl_def_id_managed_list_items_id_fk" FOREIGN KEY ("dl_def_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_data" ADD CONSTRAINT "governance_data_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_context_data" ADD CONSTRAINT "utility_context_data_dl_def_id_managed_list_items_id_fk" FOREIGN KEY ("dl_def_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_context_data" ADD CONSTRAINT "utility_context_data_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc" ADD CONSTRAINT "bsc_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsc" ADD CONSTRAINT "bsc_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi" ADD CONSTRAINT "kpi_report_period_id_report_periods_id_fk" FOREIGN KEY ("report_period_id") REFERENCES "public"."report_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi" ADD CONSTRAINT "kpi_kpi_def_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_def_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_calculation_attempts" ADD CONSTRAINT "kpi_calculation_attempts_source_data_entry_id_data_entries_id_fk" FOREIGN KEY ("source_data_entry_id") REFERENCES "public"."data_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_calculation_attempts" ADD CONSTRAINT "kpi_calculation_attempts_kpi_def_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_def_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_calculation_attempts" ADD CONSTRAINT "kpi_calculation_attempts_report_period_id_report_periods_id_fk" FOREIGN KEY ("report_period_id") REFERENCES "public"."report_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_category_id_managed_list_items_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_subcategory_id_managed_list_items_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_agg_level_id_managed_list_items_id_fk" FOREIGN KEY ("agg_level_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_unit_id_managed_list_items_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_owner_utility_id_organisations_id_fk" FOREIGN KEY ("owner_utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_target_trajectory" ADD CONSTRAINT "kpi_target_trajectory_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_target_trajectory" ADD CONSTRAINT "kpi_target_trajectory_kpi_def_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_def_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_target_trajectory" ADD CONSTRAINT "kpi_target_trajectory_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resource_type_relevance" ADD CONSTRAINT "energy_resource_type_relevance_energy_resource_type_id_managed_list_items_id_fk" FOREIGN KEY ("energy_resource_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resource_type_relevance" ADD CONSTRAINT "energy_resource_type_relevance_energy_type_id_managed_list_items_id_fk" FOREIGN KEY ("energy_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resource_type_relevance" ADD CONSTRAINT "energy_resource_type_relevance_energy_source_id_managed_list_items_id_fk" FOREIGN KEY ("energy_source_id") REFERENCES "public"."managed_list_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_list_items" ADD CONSTRAINT "managed_list_items_list_id_managed_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."managed_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_periods" ADD CONSTRAINT "report_periods_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_periods" ADD CONSTRAINT "report_periods_report_type_id_managed_list_items_id_fk" FOREIGN KEY ("report_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_periods" ADD CONSTRAINT "report_periods_status_id_managed_list_items_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_periods" ADD CONSTRAINT "report_periods_who_id_roles_id_fk" FOREIGN KEY ("who_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_style_override" ADD CONSTRAINT "ui_style_override_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_power_station_id_power_stations_id_fk" FOREIGN KEY ("power_station_id") REFERENCES "public"."power_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_energy_provider_id_managed_list_items_id_fk" FOREIGN KEY ("energy_provider_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_energy_type_id_managed_list_items_id_fk" FOREIGN KEY ("energy_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_energy_source_id_managed_list_items_id_fk" FOREIGN KEY ("energy_source_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_type_id_managed_list_items_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_agg_level_id_managed_list_items_id_fk" FOREIGN KEY ("agg_level_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_resources" ADD CONSTRAINT "energy_resources_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_powerquality_standard_id_managed_list_items_id_fk" FOREIGN KEY ("powerquality_standard_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_electricity_regulation_id_managed_list_items_id_fk" FOREIGN KEY ("electricity_regulation_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_accounting_standard_id_managed_list_items_id_fk" FOREIGN KEY ("accounting_standard_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_entity_type_id_managed_list_items_id_fk" FOREIGN KEY ("entity_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_utility_type_id_managed_list_items_id_fk" FOREIGN KEY ("utility_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_operating_basis_id_managed_list_items_id_fk" FOREIGN KEY ("operating_basis_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_ppa_membership_type_id_managed_list_items_id_fk" FOREIGN KEY ("ppa_membership_type_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_utility_size_id_managed_list_items_id_fk" FOREIGN KEY ("utility_size_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_services_provided_id_managed_list_items_id_fk" FOREIGN KEY ("services_provided_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_stations" ADD CONSTRAINT "power_stations_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_stations" ADD CONSTRAINT "power_stations_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_utility_id_organisations_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_agg_level_id_managed_list_items_id_fk" FOREIGN KEY ("agg_level_id") REFERENCES "public"."managed_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_benchmark_kpi_name_idx" ON "ai_benchmark" USING btree ("kpi_name");--> statement-breakpoint
CREATE INDEX "ai_benchmark_category_idx" ON "ai_benchmark" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ai_chat_session_user_last_turn_idx" ON "ai_chat_session" USING btree ("user_id","last_turn_at");--> statement-breakpoint
CREATE INDEX "ai_chat_session_user_deleted_idx" ON "ai_chat_session" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "ai_chat_turn_session_turn_idx" ON "ai_chat_turn" USING btree ("session_id","turn_number");--> statement-breakpoint
CREATE INDEX "ai_chat_turn_created_idx" ON "ai_chat_turn" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_cost_budget_user_id_idx" ON "ai_cost_budget" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_turn_idx" ON "ai_feedback" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_user_idx" ON "ai_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_sentiment_idx" ON "ai_feedback" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "ai_rate_limit_window_user_type_start_idx" ON "ai_rate_limit_window" USING btree ("user_id","window_type","window_start");--> statement-breakpoint
CREATE INDEX "ai_review_queue_turn_idx" ON "ai_review_queue" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "ai_review_queue_decision_idx" ON "ai_review_queue" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "ai_tool_call_turn_idx" ON "ai_tool_call" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "ai_tool_call_tool_name_idx" ON "ai_tool_call" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "ai_tool_call_status_idx" ON "ai_tool_call" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_usage_metrics_user_date_idx" ON "ai_usage_metrics" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "ai_usage_metrics_cost_idx" ON "ai_usage_metrics" USING btree ("user_id","estimated_cost_cents");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_reg_clarification_target_user_idx" ON "user_registration_clarification_message" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_reg_clarification_actor_user_idx" ON "user_registration_clarification_message" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "user_status_event_target_user_idx" ON "user_status_event" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_status_event_actor_user_idx" ON "user_status_event" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "benchmarking_request_requesting_idx" ON "benchmarking_request" USING btree ("requesting_utility_id");--> statement-breakpoint
CREATE INDEX "benchmarking_request_benchmark_idx" ON "benchmarking_request" USING btree ("benchmark_utility_id");--> statement-breakpoint
CREATE INDEX "bsc_initiative_utility_idx" ON "bsc_initiative" USING btree ("utility_id");--> statement-breakpoint
CREATE INDEX "bsc_initiative_objective_idx" ON "bsc_initiative" USING btree ("specific_objective_id");--> statement-breakpoint
CREATE INDEX "bsc_kpi_link_utility_idx" ON "bsc_kpi_link" USING btree ("utility_id");--> statement-breakpoint
CREATE INDEX "bsc_kpi_link_initiative_idx" ON "bsc_kpi_link" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX "bsc_kpi_link_kpi_def_idx" ON "bsc_kpi_link" USING btree ("kpi_def_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bsc_kpi_target_plan_utility_kpi_idx" ON "bsc_kpi_target_plan" USING btree ("utility_id","kpi_def_id");--> statement-breakpoint
CREATE INDEX "bsc_objective_link_utility_idx" ON "bsc_objective_link" USING btree ("utility_id");--> statement-breakpoint
CREATE INDEX "bsc_objective_link_source_idx" ON "bsc_objective_link" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "bsc_objective_link_target_idx" ON "bsc_objective_link" USING btree ("target_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bsc_objective_link_pair_idx" ON "bsc_objective_link" USING btree ("utility_id","source_node_id","target_node_id");--> statement-breakpoint
CREATE INDEX "bsc_specific_objective_utility_idx" ON "bsc_specific_objective" USING btree ("utility_id");--> statement-breakpoint
CREATE INDEX "bsc_specific_objective_lever_idx" ON "bsc_specific_objective" USING btree ("lever_node_id");--> statement-breakpoint
CREATE INDEX "bsc_template_link_source_idx" ON "bsc_template_link" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "bsc_template_link_target_idx" ON "bsc_template_link" USING btree ("target_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bsc_template_link_pair_idx" ON "bsc_template_link" USING btree ("source_node_id","target_node_id");--> statement-breakpoint
CREATE INDEX "bsc_template_node_parent_idx" ON "bsc_template_node" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "bsc_template_node_level_idx" ON "bsc_template_node" USING btree ("level");--> statement-breakpoint
CREATE UNIQUE INDEX "bsc_theme_scope_idx" ON "bsc_theme" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "bsc_utility_node_utility_idx" ON "bsc_utility_node" USING btree ("utility_id");--> statement-breakpoint
CREATE INDEX "bsc_utility_node_parent_idx" ON "bsc_utility_node" USING btree ("parent_node_id");--> statement-breakpoint
CREATE INDEX "bsc_utility_node_template_idx" ON "bsc_utility_node" USING btree ("template_node_id");--> statement-breakpoint
CREATE INDEX "bsc_utility_node_utility_level_idx" ON "bsc_utility_node" USING btree ("utility_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "bsc_utility_node_utility_template_uidx" ON "bsc_utility_node" USING btree ("utility_id","template_node_id") WHERE "bsc_utility_node"."template_node_id" is not null;--> statement-breakpoint
CREATE INDEX "custom_kpi_decision_request_idx" ON "custom_kpi_decision" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "custom_kpi_decision_reviewer_idx" ON "custom_kpi_decision" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "custom_kpi_email_delivery_request_idx" ON "custom_kpi_email_delivery" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "custom_kpi_email_delivery_status_idx" ON "custom_kpi_email_delivery" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "custom_kpi_lifecycle_request_idx" ON "custom_kpi_lifecycle_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "custom_kpi_request_submitter_idx" ON "custom_kpi_request" USING btree ("submitter_user_id");--> statement-breakpoint
CREATE INDEX "custom_kpi_request_status_idx" ON "custom_kpi_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custom_kpi_request_fingerprint_idx" ON "custom_kpi_request" USING btree ("submitter_user_id","definition_fingerprint","status");--> statement-breakpoint
CREATE INDEX "uniq_entry" ON "data_entries" USING btree ("report_period_id","measure_def_id","service_area_id","energy_source_id","energy_provider_id","energy_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_input_dl_def_mappings_input_training" ON "input_dl_def_mappings" USING btree ("measure_def_id","training_dl_def_id");--> statement-breakpoint
CREATE INDEX "idx_input_dl_def_mappings_training_dl_def_id" ON "input_dl_def_mappings" USING btree ("training_dl_def_id");--> statement-breakpoint
CREATE INDEX "uniq_tariff_relevance" ON "tariff_relevance" USING btree ("report_period_id","service_area_id","measure_def_id","payment_mode_id","customer_type_id");--> statement-breakpoint
CREATE INDEX "uniq_transmission_relevance" ON "transmission_relevance" USING btree ("report_period_id","service_area_id","measure_def_id");--> statement-breakpoint
CREATE INDEX "kpi_calc_attempt_trigger_idx" ON "kpi_calculation_attempts" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "kpi_calc_attempt_scope_status_idx" ON "kpi_calculation_attempts" USING btree ("report_period_id","kpi_def_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_target_trajectory_utility_kpi_idx" ON "kpi_target_trajectory" USING btree ("utility_id","kpi_def_id");--> statement-breakpoint
CREATE INDEX "energy_resource_type_relevance_type_idx" ON "energy_resource_type_relevance" USING btree ("energy_resource_type_id","energy_type_id","energy_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ui_style_override_scope_idx" ON "ui_style_override" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "gen_idx" ON "energy_resources" USING btree ("name","utility_id");--> statement-breakpoint
CREATE INDEX "organisation_idx" ON "organisations" USING btree ("country_id","id","name");