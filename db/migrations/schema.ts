import { pgTable, index, foreignKey, serial, integer, text, boolean, timestamp, jsonb, unique, check, varchar, numeric, uuid, json, uniqueIndex, bigint, smallint, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const aiChatTurn = pgTable("ai_chat_turn", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	turnNumber: integer("turn_number").notNull(),
	userMessage: text("user_message").notNull(),
	assistantResponse: text("assistant_response"),
	modelUsed: text("model_used"),
	modelWasFallback: boolean("model_was_fallback").default(false),
	promptVersion: text("prompt_version"),
	tokenCountInput: integer("token_count_input"),
	tokenCountOutput: integer("token_count_output"),
	latencyMs: integer("latency_ms"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_chat_turn_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("ai_chat_turn_session_turn_idx").using("btree", table.sessionId.asc().nullsLast().op("int4_ops"), table.turnNumber.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [aiChatSession.id],
			name: "ai_chat_turn_session_id_ai_chat_session_id_fk"
		}).onDelete("cascade"),
]);

export const aiFeedback = pgTable("ai_feedback", {
	id: serial().primaryKey().notNull(),
	turnId: integer("turn_id").notNull(),
	userId: text("user_id").notNull(),
	sentiment: text().notNull(),
	correctionText: text("correction_text"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_feedback_sentiment_idx").using("btree", table.sentiment.asc().nullsLast().op("text_ops")),
	index("ai_feedback_turn_idx").using("btree", table.turnId.asc().nullsLast().op("int4_ops")),
	index("ai_feedback_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.turnId],
			foreignColumns: [aiChatTurn.id],
			name: "ai_feedback_turn_id_ai_chat_turn_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ai_feedback_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const aiChatSession = pgTable("ai_chat_session", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text().default('New chat').notNull(),
	contextSummary: jsonb("context_summary"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	lastTurnAt: timestamp("last_turn_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
	index("ai_chat_session_user_deleted_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.deletedAt.asc().nullsLast().op("timestamp_ops")),
	index("ai_chat_session_user_last_turn_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.lastTurnAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ai_chat_session_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const countryContext = pgTable("country_context", {
	id: serial().primaryKey().notNull(),
	countryId: integer("country_id").notNull(),
	measureDefId: integer("measure_def_id").notNull(),
	sourceDate: date("source_date", { mode: 'date' }).notNull(),
	sourceDoc: varchar("source_doc", { length: 500 }),
	sourceUrl: varchar("source_url", { length: 500 }),
	value: varchar({ length: 1000 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	updatedDate: timestamp("updated_date", { mode: 'string' }).defaultNow().notNull(),
	noDataReason: varchar("no_data_reason", { length: 32 }),
}, (table) => [
	foreignKey({
			columns: [table.countryId],
			foreignColumns: [countries.id],
			name: "country_context_country_id_countries_id_fk"
		}),
	foreignKey({
			columns: [table.measureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "country_context_measure_def_id_fk"
		}),
	unique("uq_country_context_metric_source").on(table.countryId, table.measureDefId, table.sourceDate),
	check("chk_cc_no_data_reason", sql`(no_data_reason IS NULL) OR ((no_data_reason)::text = 'not_available'::text)`),
	check("chk_cc_value_xor_nodata", sql`(((value IS NOT NULL))::integer + ((no_data_reason IS NOT NULL))::integer) <= 1`),
]);

export const auditLogs = pgTable("audit_logs", {
	id: serial().primaryKey().notNull(),
	action: text().notNull(),
	actorUserId: text("actor_user_id"),
	actorEmail: text("actor_email"),
	actorRole: text("actor_role"),
	targetType: text("target_type").notNull(),
	targetId: text("target_id"),
	details: jsonb(),
	ipAddress: text("ip_address"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_logs_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("audit_logs_actor_idx").using("btree", table.actorUserId.asc().nullsLast().op("text_ops")),
	index("audit_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("audit_logs_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [user.id],
			name: "audit_logs_actor_user_id_user_id_fk"
		}).onDelete("set null"),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("account_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const migrationRejections = pgTable("migration_rejections", {
	id: serial().primaryKey().notNull(),
	loadRun: varchar("load_run", { length: 64 }),
	sourceSystem: varchar("source_system", { length: 64 }),
	sourceRef: varchar("source_ref", { length: 255 }),
	sourcePayload: jsonb("source_payload"),
	measureDefId: integer("measure_def_id"),
	measureName: text("measure_name"),
	reportPeriod: text("report_period"),
	utility: text(),
	failureCategory: varchar("failure_category", { length: 32 }),
	failureColumns: text("failure_columns").array(),
	failureReason: text("failure_reason"),
	failureRule: varchar("failure_rule", { length: 128 }),
	remediation: text(),
	rawError: text("raw_error"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	loadId: integer("load_id"),
	p1ReportPeriodId: integer("p1_report_period_id"),
	stage: varchar({ length: 8 }),
	intendedValueType: varchar("intended_value_type", { length: 16 }),
	attemptedNumeric: numeric("attempted_numeric"),
}, (table) => [
	index("idx_mig_rej_category").using("btree", table.failureCategory.asc().nullsLast().op("text_ops")),
	index("idx_mig_rej_load").using("btree", table.loadId.asc().nullsLast().op("int4_ops")),
	index("idx_mig_rej_measure").using("btree", table.measureDefId.asc().nullsLast().op("int4_ops")),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
	twoFactorVerifiedAt: timestamp("two_factor_verified_at", { mode: 'string' }),
}, (table) => [
	index("session_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const userRegistrationClarificationMessage = pgTable("user_registration_clarification_message", {
	id: serial().primaryKey().notNull(),
	targetUserId: text("target_user_id").notNull(),
	actorUserId: text("actor_user_id").notNull(),
	direction: text().notNull(),
	subject: text(),
	message: text().notNull(),
	receivedFromEmail: text("received_from_email"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_reg_clarification_actor_user_idx").using("btree", table.actorUserId.asc().nullsLast().op("text_ops")),
	index("user_reg_clarification_target_user_idx").using("btree", table.targetUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [user.id],
			name: "user_registration_clarification_message_actor_user_id_user_id_f"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetUserId],
			foreignColumns: [user.id],
			name: "user_registration_clarification_message_target_user_id_user_id_"
		}).onDelete("cascade"),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	organisationId: integer("organisation_id"),
	roleId: integer("role_id"),
	status: text().default('pending').notNull(),
	dateApproved: timestamp("date_approved", { mode: 'string' }),
	dateRejected: timestamp("date_rejected", { mode: 'string' }),
	rejectedByUserId: text("rejected_by_user_id"),
	datasetRequired: text("dataset_required"),
	dataAccessReason: text("data_access_reason"),
	rejectReason: text("reject_reason"),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organisationId],
			foreignColumns: [organisations.id],
			name: "user_organisation_id_organisations_id_fk"
		}),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "user_role_id_roles_id_fk"
		}),
	unique("user_email_unique").on(table.email),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const userStatusEvent = pgTable("user_status_event", {
	id: serial().primaryKey().notNull(),
	targetUserId: text("target_user_id").notNull(),
	actorUserId: text("actor_user_id").notNull(),
	fromStatus: text("from_status").notNull(),
	toStatus: text("to_status").notNull(),
	decisionType: text("decision_type").notNull(),
	reason: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_status_event_actor_user_idx").using("btree", table.actorUserId.asc().nullsLast().op("text_ops")),
	index("user_status_event_target_user_idx").using("btree", table.targetUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [user.id],
			name: "user_status_event_actor_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetUserId],
			foreignColumns: [user.id],
			name: "user_status_event_target_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const migrationLoads = pgTable("migration_loads", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 64 }),
	sourceSystem: varchar("source_system", { length: 64 }),
	status: varchar({ length: 16 }).default('running').notNull(),
	rowsIn: integer("rows_in"),
	rowsMigrated: integer("rows_migrated"),
	rowsFailed: integer("rows_failed"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { mode: 'string' }),
	notes: text(),
});

export const countries = pgTable("countries", {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	dialCode: varchar("dial_code", { length: 10 }).notNull(),
	isoCodeAlpha2: varchar("iso_code_alpha2").notNull(),
	isoCodeAlpha3: varchar("iso_code_alpha3").notNull(),
	currencyId: integer("currency_id").notNull(),
	isAdbMember: boolean("is_adb_member").default(true).notNull(),
	subRegionId: integer("sub_region_id").notNull(),
	updatedDate: timestamp("updated_date", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.currencyId],
			foreignColumns: [managedListItems.id],
			name: "countries_currency_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.subRegionId],
			foreignColumns: [subRegions.id],
			name: "countries_sub_region_id_sub_regions_id_fk"
		}),
]);

export const customKpiRequest = pgTable("custom_kpi_request", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	submitterUserId: text("submitter_user_id").notNull(),
	title: text().notNull(),
	description: text(),
	formulaExpression: text("formula_expression").notNull(),
	isPrivate: boolean("is_private").default(false).notNull(),
	unitId: integer("unit_id"),
	proposedUnits: json("proposed_units").default([]).notNull(),
	proposedInputs: json("proposed_inputs").default([]).notNull(),
	selectedInputDefinitionIds: json("selected_input_definition_ids").default([]).notNull(),
	definitionFingerprint: text("definition_fingerprint").notNull(),
	status: text().default('PENDING_REVIEW').notNull(),
	visibilityScope: text("visibility_scope").default('SUBMITTER_ONLY').notNull(),
	replacementKpiDefId: integer("replacement_kpi_def_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("custom_kpi_request_fingerprint_idx").using("btree", table.submitterUserId.asc().nullsLast().op("text_ops"), table.definitionFingerprint.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("custom_kpi_request_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("custom_kpi_request_submitter_idx").using("btree", table.submitterUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.replacementKpiDefId],
			foreignColumns: [kpiDefinitions.id],
			name: "custom_kpi_request_replacement_kpi_def_id_kpi_definitions_id_fk"
		}),
	foreignKey({
			columns: [table.submitterUserId],
			foreignColumns: [user.id],
			name: "custom_kpi_request_submitter_user_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [managedListItems.id],
			name: "custom_kpi_request_unit_id_managed_list_items_id_fk"
		}),
]);

export const customKpiEmailDelivery = pgTable("custom_kpi_email_delivery", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	decisionId: uuid("decision_id").notNull(),
	recipientEmail: text("recipient_email").notNull(),
	deliveryStatus: text("delivery_status").default('PENDING').notNull(),
	attemptCount: integer("attempt_count").default(0).notNull(),
	lastError: text("last_error"),
	nextAttemptAt: timestamp("next_attempt_at", { mode: 'string' }),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("custom_kpi_email_delivery_request_idx").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	index("custom_kpi_email_delivery_status_idx").using("btree", table.deliveryStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.decisionId],
			foreignColumns: [customKpiDecision.id],
			name: "custom_kpi_email_delivery_decision_id_custom_kpi_decision_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [customKpiRequest.id],
			name: "custom_kpi_email_delivery_request_id_custom_kpi_request_id_fk"
		}).onDelete("cascade"),
]);

export const customKpiLifecycleEvent = pgTable("custom_kpi_lifecycle_event", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	eventType: text("event_type").notNull(),
	actorUserId: text("actor_user_id"),
	metadataJson: json("metadata_json"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("custom_kpi_lifecycle_request_idx").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [user.id],
			name: "custom_kpi_lifecycle_event_actor_user_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [customKpiRequest.id],
			name: "custom_kpi_lifecycle_event_request_id_custom_kpi_request_id_fk"
		}).onDelete("cascade"),
]);

export const migrationScorecard = pgTable("migration_scorecard", {
	id: serial().primaryKey().notNull(),
	loadId: integer("load_id").notNull(),
	p1ReportPeriodId: integer("p1_report_period_id").notNull(),
	reportPeriodId: integer("report_period_id"),
	periodLabel: varchar("period_label", { length: 64 }),
	reconLine: varchar("recon_line", { length: 16 }).notNull(),
	valueType: varchar("value_type", { length: 16 }).default('na').notNull(),
	source: numeric().default('0').notNull(),
	migrated: numeric().default('0').notNull(),
	failed: numeric().default('0').notNull(),
	variance: numeric().generatedAlwaysAs(sql`((source - migrated) - failed)`),
	balanceExpected: boolean("balance_expected").generatedAlwaysAs(sql`((recon_line)::text = ANY ((ARRAY['shell'::character varying, 'value'::character varying, 'value_sum'::character varying, 'leak'::character varying])::text[]))`),
	isBalanced: boolean("is_balanced").generatedAlwaysAs(sql`(source = (migrated + failed))`),
	note: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scorecard_load").using("btree", table.loadId.asc().nullsLast().op("int4_ops")),
	unique("uq_scorecard").on(table.loadId, table.p1ReportPeriodId, table.reconLine, table.valueType),
]);

export const dataEntryLogs = pgTable("data_entry_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	dataEntryId: uuid("data_entry_id").notNull(),
	previousValue: varchar("previous_value", { length: 255 }).notNull(),
	newValue: varchar("new_value", { length: 255 }).notNull(),
	updatedById: text("updated_by_id").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	valueSnapshot: jsonb("value_snapshot"),
}, (table) => [
	foreignKey({
			columns: [table.dataEntryId],
			foreignColumns: [dataEntries.id],
			name: "data_entry_logs_data_entry_id_data_entries_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "data_entry_logs_updated_by_id_user_id_fk"
		}),
]);

export const inputRelevance = pgTable("input_relevance", {
	id: serial().primaryKey().notNull(),
	measureDefId: integer("measure_def_id").notNull(),
	dimensionId: integer("dimension_id").notNull(),
	isRelevant: boolean("is_relevant").default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.dimensionId],
			foreignColumns: [managedListItems.id],
			name: "input_relevance_dimension_id_managed_list_items_id_fk"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.measureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "input_relevance_measure_def_id_measure_definitions_id_fk"
		}).onDelete("cascade"),
]);

export const emailSchedules = pgTable("email_schedules", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	recipientRole: varchar("recipient_role", { length: 50 }).notNull(),
	frequency: varchar({ length: 20 }).notNull(),
	dayOfWeek: integer("day_of_week"),
	dayOfMonth: integer("day_of_month"),
	startsAt: timestamp("starts_at", { mode: 'string' }).defaultNow().notNull(),
	endsAt: timestamp("ends_at", { mode: 'string' }),
	utilityId: integer("utility_id"),
	isActive: boolean("is_active").default(true).notNull(),
	lastSentAt: timestamp("last_sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "email_schedules_utility_id_organisations_id_fk"
		}),
]);

export const inputDlDefMappings = pgTable("input_dl_def_mappings", {
	id: serial().primaryKey().notNull(),
	measureDefId: integer("measure_def_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	trainingDlDefId: bigint("training_dl_def_id", { mode: "number" }).notNull(),
	trainingDlLegacyId: varchar("training_dl_legacy_id", { length: 64 }).notNull(),
	trainingSourceId: integer("training_source_id"),
	trainingDlName: varchar("training_dl_name", { length: 255 }).notNull(),
	trainingVariableName: varchar("training_variable_name", { length: 255 }),
	score: integer().default(0).notNull(),
	confidence: varchar({ length: 16 }).notNull(),
	reasons: json(),
	isAuto: boolean("is_auto").default(false).notNull(),
	isApproved: boolean("is_approved").default(true).notNull(),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	approvedById: text("approved_by_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_input_dl_def_mappings_training_dl_def_id").using("btree", table.trainingDlDefId.asc().nullsLast().op("int8_ops")),
	uniqueIndex("uniq_input_dl_def_mappings_input_training").using("btree", table.measureDefId.asc().nullsLast().op("int4_ops"), table.trainingDlDefId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.approvedById],
			foreignColumns: [user.id],
			name: "input_dl_def_mappings_approved_by_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.measureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "input_dl_def_mappings_measure_def_id_measure_definitions_id_fk"
		}).onDelete("cascade"),
]);

export const devValidationBuilderConfig = pgTable("dev_validation_builder_config", {
	configKey: text("config_key").primaryKey().notNull(),
	configJson: text("config_json").notNull(),
	updatedById: text("updated_by_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "dev_validation_builder_config_updated_by_id_user_id_fk"
		}),
]);

export const scheduleSendLogs = pgTable("schedule_send_logs", {
	id: serial().primaryKey().notNull(),
	scheduleId: integer("schedule_id").notNull(),
	recipientCount: integer("recipient_count").default(0).notNull(),
	errorCount: integer("error_count").default(0).notNull(),
	sentBy: varchar("sent_by", { length: 255 }),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.scheduleId],
			foreignColumns: [emailSchedules.id],
			name: "schedule_send_logs_schedule_id_email_schedules_id_fk"
		}).onDelete("cascade"),
]);

export const kpi = pgTable("kpi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reportPeriodId: serial("report_period_id").notNull(),
	kpiDefId: serial("kpi_def_id").notNull(),
	targetValue: varchar("target_value", { length: 255 }),
	actualValue: varchar("actual_value", { length: 255 }).notNull(),
	comments: varchar({ length: 255 }),
	isRelevant: boolean("is_relevant").default(true).notNull(),
	isFavourite: boolean("is_favourite").default(false).notNull(),
	calculatedAt: timestamp("calculated_at", { mode: 'string' }).defaultNow().notNull(),
	calculationFormulaVersion: varchar("calculation_formula_version", { length: 255 }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.kpiDefId],
			foreignColumns: [kpiDefinitions.id],
			name: "kpi_kpi_def_id_kpi_definitions_id_fk"
		}),
	foreignKey({
			columns: [table.reportPeriodId],
			foreignColumns: [reportPeriods.id],
			name: "kpi_report_period_id_report_periods_id_fk"
		}),
]);

export const errorLogs = pgTable("error_logs", {
	id: serial().primaryKey().notNull(),
	source: text().notNull(),
	errorType: text("error_type").notNull(),
	severity: text().default('error').notNull(),
	message: text().notNull(),
	stack: text(),
	context: text(),
	url: text(),
	userId: text("user_id"),
	userEmail: text("user_email"),
	userRole: text("user_role"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
});

export const governanceData = pgTable("governance_data", {
	id: serial().primaryKey().notNull(),
	dlDefId: integer("dl_def_id").notNull(),
	utilityId: integer("utility_id").notNull(),
	value: varchar({ length: 255 }),
	updatedBy: integer("updated_by"),
	updatedDate: timestamp("updated_date", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.dlDefId],
			foreignColumns: [managedListItems.id],
			name: "governance_data_dl_def_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "governance_data_utility_id_organisations_id_fk"
		}),
]);

export const utilityContextData = pgTable("utility_context_data", {
	id: serial().primaryKey().notNull(),
	dlDefId: integer("dl_def_id").notNull(),
	utilityId: integer("utility_id").notNull(),
	value: varchar({ length: 255 }),
	reportPeriodId: integer("report_period_id"),
	updatedBy: integer("updated_by"),
	updatedDate: timestamp("updated_date", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.dlDefId],
			foreignColumns: [managedListItems.id],
			name: "utility_context_data_dl_def_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "utility_context_data_utility_id_organisations_id_fk"
		}),
]);

export const bsc = pgTable("bsc", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	perspective: json(),
	relationships: json(),
	updatedById: text("updated_by_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "bsc_updated_by_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_utility_id_organisations_id_fk"
		}),
]);

export const kpiCalculationAttempts = pgTable("kpi_calculation_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	triggerId: uuid("trigger_id").notNull(),
	sourceDataEntryId: uuid("source_data_entry_id").notNull(),
	kpiDefId: integer("kpi_def_id"),
	reportPeriodId: integer("report_period_id").notNull(),
	scope: json().notNull(),
	status: varchar({ length: 32 }).default('pending').notNull(),
	formulaVersion: varchar("formula_version", { length: 255 }).default('unspecified').notNull(),
	retryCount: integer("retry_count").default(0).notNull(),
	maxRetries: integer("max_retries").default(3).notNull(),
	failureReason: text("failure_reason"),
	failureType: varchar("failure_type", { length: 32 }),
	deferredFollowUp: boolean("deferred_follow_up").default(false).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("kpi_calc_attempt_scope_status_idx").using("btree", table.reportPeriodId.asc().nullsLast().op("int4_ops"), table.kpiDefId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("kpi_calc_attempt_trigger_idx").using("btree", table.triggerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.kpiDefId],
			foreignColumns: [kpiDefinitions.id],
			name: "kpi_calculation_attempts_kpi_def_id_kpi_definitions_id_fk"
		}),
	foreignKey({
			columns: [table.reportPeriodId],
			foreignColumns: [reportPeriods.id],
			name: "kpi_calculation_attempts_report_period_id_report_periods_id_fk"
		}),
	foreignKey({
			columns: [table.sourceDataEntryId],
			foreignColumns: [dataEntries.id],
			name: "kpi_calculation_attempts_source_data_entry_id_data_entries_id_f"
		}),
]);

export const units = pgTable("units", {
	id: serial().primaryKey().notNull(),
	periodEntries: jsonb("period_entries").default([]).notNull(),
	name: varchar({ length: 255 }).notNull(),
	powerStationId: integer("power_station_id"),
	serviceAreaId: integer("service_area_id").notNull(),
	utilityId: integer("utility_id").notNull(),
	providerId: integer("provider_id").notNull(),
	technologyId: integer("technology_id").notNull(),
	isVirtual: boolean("is_virtual").default(false).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedById: text("updated_by_id"),
	categoryId: integer("category_id").notNull(),
	assetClassId: integer("asset_class_id").notNull(),
	isAggregated: boolean("is_aggregated").default(false).notNull(),
}, (table) => [
	index("gen_idx").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.utilityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.assetClassId],
			foreignColumns: [managedListItems.id],
			name: "units_asset_class_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [managedListItems.id],
			name: "units_category_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.powerStationId],
			foreignColumns: [powerStations.id],
			name: "units_power_station_id_power_stations_id_fk"
		}),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [managedListItems.id],
			name: "units_provider_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.serviceAreaId],
			foreignColumns: [serviceAreas.id],
			name: "units_service_area_id_service_areas_id_fk"
		}),
	foreignKey({
			columns: [table.technologyId],
			foreignColumns: [managedListItems.id],
			name: "units_technology_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "units_updated_by_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "units_utility_id_organisations_id_fk"
		}),
]);

export const assetClassRelevance = pgTable("asset_class_relevance", {
	id: serial().primaryKey().notNull(),
	assetClassId: integer("asset_class_id").notNull(),
	categoryId: integer("category_id").notNull(),
	technologyId: integer("technology_id").notNull(),
}, (table) => [
	index("asset_class_relevance_type_idx").using("btree", table.assetClassId.asc().nullsLast().op("int4_ops"), table.categoryId.asc().nullsLast().op("int4_ops"), table.technologyId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.assetClassId],
			foreignColumns: [managedListItems.id],
			name: "asset_class_relevance_asset_class_id_managed_list_items_id_fk"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [managedListItems.id],
			name: "asset_class_relevance_category_id_managed_list_items_id_fk"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.technologyId],
			foreignColumns: [managedListItems.id],
			name: "asset_class_relevance_technology_id_managed_list_items_id_fk"
		}).onDelete("restrict"),
]);

export const migrationLogs = pgTable("migration_logs", {
	id: serial().primaryKey().notNull(),
	runAt: timestamp("run_at", { mode: 'string' }).defaultNow().notNull(),
	stepLabel: text("step_label").notNull(),
	success: boolean().notNull(),
	durationMs: integer("duration_ms").notNull(),
	errorMessage: text("error_message"),
	recordsAffected: text("records_affected"),
});

export const sidebarAccess = pgTable("sidebar_access", {
	id: uuid().primaryKey().notNull(),
	name: text().notNull(),
	page: text().notNull(),
	roles: text().notNull(),
	order: integer().default(0).notNull(),
});

export const managedLists = pgTable("managed_lists", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: varchar({ length: 255 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
});

export const managedListItems = pgTable("managed_list_items", {
	id: serial().primaryKey().notNull(),
	listId: integer("list_id").notNull(),
	parentId: integer("parent_id"),
	assetClassId: integer("asset_class_id"),
	name: varchar({ length: 255 }).notNull(),
	description: varchar({ length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
	color: varchar().default('#EE32DD').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.listId],
			foreignColumns: [managedLists.id],
			name: "managed_list_items_list_id_managed_lists_id_fk"
		}),
]);

export const reportPeriods = pgTable("report_periods", {
	id: serial().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	reportTypeId: integer("report_type_id").notNull(),
	reportDate: timestamp("report_date", { mode: 'string' }).notNull(),
	requestDate: timestamp("request_date", { mode: 'string' }).notNull(),
	statusId: integer("status_id"),
	whoId: integer("who_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	leanMode: boolean("lean_mode").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.reportTypeId],
			foreignColumns: [managedListItems.id],
			name: "report_periods_report_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "report_periods_utility_id_organisations_id_fk"
		}),
	foreignKey({
			columns: [table.whoId],
			foreignColumns: [roles.id],
			name: "report_periods_who_id_roles_id_fk"
		}),
	check("chk_rp_status_lifecycle", sql`status_id = ANY (ARRAY[2, 3, 4, 5])`),
]);

export const organisations = pgTable("organisations", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	acronym: varchar({ length: 255 }),
	countryId: integer("country_id").notNull(),
	isUtility: boolean("is_utility").default(false).notNull(),
	powerqualityStandardId: integer("powerquality_standard_id"),
	electricityRegulationId: integer("electricity_regulation_id"),
	accountingStandardId: integer("accounting_standard_id"),
	entityTypeId: integer("entity_type_id"),
	utilityTypeId: integer("utility_type_id"),
	operatingBasisId: integer("operating_basis_id"),
	ppaMembershipTypeId: integer("ppa_membership_type_id"),
	utilitySizeId: integer("utility_size_id"),
	servicesProvidedId: integer("services_provided_id"),
	isMthReportRelevant: boolean("is_mth_report_relevant").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	updatedDate: varchar("updated_date", { length: 255 }),
	fyeMonth: smallint("fye_month"),
	fyeDay: smallint("fye_day"),
}, (table) => [
	index("organisation_idx").using("btree", table.countryId.asc().nullsLast().op("text_ops"), table.id.asc().nullsLast().op("int4_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountingStandardId],
			foreignColumns: [managedListItems.id],
			name: "organisations_accounting_standard_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.countryId],
			foreignColumns: [countries.id],
			name: "organisations_country_id_countries_id_fk"
		}),
	foreignKey({
			columns: [table.electricityRegulationId],
			foreignColumns: [managedListItems.id],
			name: "organisations_electricity_regulation_id_managed_list_items_id_f"
		}),
	foreignKey({
			columns: [table.entityTypeId],
			foreignColumns: [managedListItems.id],
			name: "organisations_entity_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.operatingBasisId],
			foreignColumns: [managedListItems.id],
			name: "organisations_operating_basis_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.powerqualityStandardId],
			foreignColumns: [managedListItems.id],
			name: "organisations_powerquality_standard_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.ppaMembershipTypeId],
			foreignColumns: [managedListItems.id],
			name: "organisations_ppa_membership_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.servicesProvidedId],
			foreignColumns: [managedListItems.id],
			name: "organisations_services_provided_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilitySizeId],
			foreignColumns: [managedListItems.id],
			name: "organisations_utility_size_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilityTypeId],
			foreignColumns: [managedListItems.id],
			name: "organisations_utility_type_id_managed_list_items_id_fk"
		}).onDelete("cascade"),
	check("chk_org_fye_day", sql`(fye_day IS NULL) OR ((fye_day >= 1) AND (fye_day <= 31))`),
	check("chk_org_fye_month", sql`(fye_month IS NULL) OR ((fye_month >= 1) AND (fye_month <= 12))`),
]);

export const measureDefinitions = pgTable("measure_definitions", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	variableName: varchar("variable_name", { length: 255 }),
	formula: text(),
	formulaInputs: json("formula_inputs"),
	measuresGroupId: integer("measures_group_id").notNull(),
	measuresSubgroupId: integer("measures_subgroup_id").notNull(),
	unitId: integer("unit_id").notNull(),
	dataTypeId: integer("data_type_id").notNull(),
	validPolarityId: integer("valid_polarity_id"),
	validTrendId: integer("valid_trend_id"),
	validRangeMin: numeric("valid_range_min"),
	validRangeMax: numeric("valid_range_max"),
	isCurrency: boolean("is_currency").default(false).notNull(),
	isAggregated: boolean("is_aggregated").default(false).notNull(),
	strataId: integer("strata_id"),
	isActive: boolean("is_active").default(true).notNull(),
	isMandatory: boolean("is_mandatory").default(false).notNull(),
	isSystemGenerated: boolean("is_system_generated").default(false).notNull(),
	isCalculated: boolean("is_calculated").default(false).notNull(),
	isKpi: boolean("is_kpi").default(false).notNull(),
	isKpiInput: boolean("is_kpi_input").default(false).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	alternativeNames: json("alternative_names"),
	sortOrder: integer("sort_order").default(0).notNull(),
	definition: text(),
	synonyms: json(),
	definitionStatus: varchar("definition_status", { length: 16 }),
	optionListId: integer("option_list_id"),
	isApportionable: boolean("is_apportionable").default(false).notNull(),
	isContextFed: boolean("is_context_fed").default(false).notNull(),
	effectiveFrom: date("effective_from"),
}, (table) => [
	foreignKey({
			columns: [table.dataTypeId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_data_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.measuresGroupId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_measures_group_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.measuresSubgroupId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_measures_subgroup_id_managed_list_items_id_"
		}),
	foreignKey({
			columns: [table.optionListId],
			foreignColumns: [managedLists.id],
			name: "measure_definitions_option_list_id_managed_lists_id_fk"
		}),
	foreignKey({
			columns: [table.strataId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_strata_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_unit_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.validPolarityId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_valid_polarity_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.validTrendId],
			foreignColumns: [managedListItems.id],
			name: "measure_definitions_valid_trend_id_managed_list_items_id_fk"
		}),
]);

export const aiReviewQueue = pgTable("ai_review_queue", {
	id: serial().primaryKey().notNull(),
	turnId: integer("turn_id").notNull(),
	flaggedReason: text("flagged_reason"),
	flaggedByFeedbackId: integer("flagged_by_feedback_id"),
	reviewerUserId: text("reviewer_user_id"),
	decision: text(),
	decisionRationale: text("decision_rationale"),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_review_queue_decision_idx").using("btree", table.decision.asc().nullsLast().op("text_ops")),
	index("ai_review_queue_turn_idx").using("btree", table.turnId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.flaggedByFeedbackId],
			foreignColumns: [aiFeedback.id],
			name: "ai_review_queue_flagged_by_feedback_id_ai_feedback_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.reviewerUserId],
			foreignColumns: [user.id],
			name: "ai_review_queue_reviewer_user_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.turnId],
			foreignColumns: [aiChatTurn.id],
			name: "ai_review_queue_turn_id_ai_chat_turn_id_fk"
		}).onDelete("cascade"),
]);

export const aiToolCall = pgTable("ai_tool_call", {
	id: serial().primaryKey().notNull(),
	turnId: integer("turn_id").notNull(),
	toolName: text("tool_name").notNull(),
	toolArgs: jsonb("tool_args").notNull(),
	toolResult: jsonb("tool_result"),
	status: text().default('pending').notNull(),
	errorMessage: text("error_message"),
	latencyMs: integer("latency_ms"),
	dataFreshness: timestamp("data_freshness", { mode: 'string' }),
	dataCompletenessPct: integer("data_completeness_pct"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_tool_call_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("ai_tool_call_tool_name_idx").using("btree", table.toolName.asc().nullsLast().op("text_ops")),
	index("ai_tool_call_turn_idx").using("btree", table.turnId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.turnId],
			foreignColumns: [aiChatTurn.id],
			name: "ai_tool_call_turn_id_ai_chat_turn_id_fk"
		}).onDelete("cascade"),
]);

export const roles = pgTable("roles", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
}, (table) => [
	unique("roles_name_unique").on(table.name),
]);

export const customKpiDecision = pgTable("custom_kpi_decision", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	reviewerUserId: text("reviewer_user_id").notNull(),
	decisionType: text("decision_type").notNull(),
	rationale: text().notNull(),
	overrideOfDecisionId: uuid("override_of_decision_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("custom_kpi_decision_request_idx").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	index("custom_kpi_decision_reviewer_idx").using("btree", table.reviewerUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [customKpiRequest.id],
			name: "custom_kpi_decision_request_id_custom_kpi_request_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewerUserId],
			foreignColumns: [user.id],
			name: "custom_kpi_decision_reviewer_user_id_user_id_fk"
		}),
]);

export const serviceAreas = pgTable("service_areas", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	utilityId: integer("utility_id").notNull(),
	providesElectricity: boolean("provides_electricity").default(true).notNull(),
	providesSanitation: boolean("provides_sanitation").default(false).notNull(),
	providesWater: boolean("provides_water").default(false).notNull(),
	operationsOnly: boolean("operations_only").default(false),
	isVirtual: boolean("is_virtual").default(false).notNull(),
	strataId: integer("strata_id").notNull(),
	reportPeriods: jsonb("report_periods").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.strataId],
			foreignColumns: [managedListItems.id],
			name: "service_areas_strata_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "service_areas_utility_id_organisations_id_fk"
		}),
]);

export const twoFactor = pgTable("two_factor", {
	id: text().primaryKey().notNull(),
	secret: text().notNull(),
	backupCodes: text("backup_codes").notNull(),
	userId: text("user_id").notNull(),
	verified: boolean().default(true).notNull(),
	failedVerificationCount: integer("failed_verification_count").default(0).notNull(),
	lockedUntil: timestamp("locked_until", { mode: 'string' }),
}, (table) => [
	index("two_factor_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "two_factor_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const bscSpecificObjective = pgTable("bsc_specific_objective", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	leverNodeId: uuid("lever_node_id").notNull(),
	description: text().notNull(),
	ord: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("bsc_specific_objective_lever_idx").using("btree", table.leverNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_specific_objective_utility_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.leverNodeId],
			foreignColumns: [bscUtilityNode.id],
			name: "bsc_specific_objective_lever_node_id_bsc_utility_node_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_specific_objective_utility_id_organisations_id_fk"
		}).onDelete("cascade"),
]);

export const bscInitiative = pgTable("bsc_initiative", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	specificObjectiveId: uuid("specific_objective_id").notNull(),
	title: text().notNull(),
	description: text(),
	ord: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	kind: varchar({ length: 16 }).default('initiative').notNull(),
	startDate: date("start_date"),
	targetCompletionDate: date("target_completion_date"),
	status: varchar({ length: 16 }),
}, (table) => [
	index("bsc_initiative_objective_idx").using("btree", table.specificObjectiveId.asc().nullsLast().op("uuid_ops")),
	index("bsc_initiative_utility_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.specificObjectiveId],
			foreignColumns: [bscSpecificObjective.id],
			name: "bsc_initiative_specific_objective_id_bsc_specific_objective_id_"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_initiative_utility_id_organisations_id_fk"
		}).onDelete("cascade"),
]);

export const subRegions = pgTable("sub_regions", {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	unContinentalRegion: varchar("un_continental_region", { length: 255 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
});

export const bscTheme = pgTable("bsc_theme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scope: varchar({ length: 32 }).default('global').notNull(),
	styles: json().default({}).notNull(),
	updatedById: text("updated_by_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("bsc_theme_scope_idx").using("btree", table.scope.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "bsc_theme_updated_by_id_user_id_fk"
		}),
]);

export const bscTemplateNode = pgTable("bsc_template_node", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	parentId: uuid("parent_id"),
	level: text().notNull(),
	label: text().notNull(),
	isMandatory: boolean("is_mandatory").default(false).notNull(),
	ord: integer().default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	mapLabel: text("map_label"),
	isMapNode: boolean("is_map_node").default(false).notNull(),
}, (table) => [
	index("bsc_template_node_level_idx").using("btree", table.level.asc().nullsLast().op("text_ops")),
	index("bsc_template_node_parent_idx").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "bsc_template_node_parent_id_bsc_template_node_id_fk"
		}).onDelete("cascade"),
]);

export const bscKpiLink = pgTable("bsc_kpi_link", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	initiativeId: uuid("initiative_id").notNull(),
	kpiDefId: integer("kpi_def_id"),
	pendingCustomKpiRequestId: uuid("pending_custom_kpi_request_id"),
	ord: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	inputDefinitionId: integer("input_definition_id"),
}, (table) => [
	index("bsc_kpi_link_initiative_idx").using("btree", table.initiativeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_kpi_link_input_def_idx").using("btree", table.inputDefinitionId.asc().nullsLast().op("int4_ops")),
	index("bsc_kpi_link_kpi_def_idx").using("btree", table.kpiDefId.asc().nullsLast().op("int4_ops")),
	index("bsc_kpi_link_utility_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.initiativeId],
			foreignColumns: [bscInitiative.id],
			name: "bsc_kpi_link_initiative_id_bsc_initiative_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inputDefinitionId],
			foreignColumns: [measureDefinitions.id],
			name: "bsc_kpi_link_input_definition_id_measure_definitions_id_fk"
		}),
	foreignKey({
			columns: [table.kpiDefId],
			foreignColumns: [kpiDefinitions.id],
			name: "bsc_kpi_link_kpi_def_id_kpi_definitions_id_fk"
		}),
	foreignKey({
			columns: [table.pendingCustomKpiRequestId],
			foreignColumns: [customKpiRequest.id],
			name: "bsc_kpi_link_pending_custom_kpi_request_id_custom_kpi_request_i"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_kpi_link_utility_id_organisations_id_fk"
		}).onDelete("cascade"),
]);

export const bscUtilityNode = pgTable("bsc_utility_node", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	templateNodeId: uuid("template_node_id"),
	parentNodeId: uuid("parent_node_id"),
	level: text().notNull(),
	label: text(),
	ord: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	mapLabel: text("map_label"),
	isMapNode: boolean("is_map_node"),
	mapX: integer("map_x"),
	mapY: integer("map_y"),
}, (table) => [
	index("bsc_utility_node_parent_idx").using("btree", table.parentNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_utility_node_template_idx").using("btree", table.templateNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_utility_node_utility_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops")),
	index("bsc_utility_node_utility_level_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops"), table.level.asc().nullsLast().op("int4_ops")),
	uniqueIndex("bsc_utility_node_utility_template_uidx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops"), table.templateNodeId.asc().nullsLast().op("int4_ops")).where(sql`(template_node_id IS NOT NULL)`),
	foreignKey({
			columns: [table.parentNodeId],
			foreignColumns: [table.id],
			name: "bsc_utility_node_parent_node_id_bsc_utility_node_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.templateNodeId],
			foreignColumns: [bscTemplateNode.id],
			name: "bsc_utility_node_template_node_id_bsc_template_node_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_utility_node_utility_id_organisations_id_fk"
		}).onDelete("cascade"),
]);

export const dataEntries = pgTable("data_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reportPeriodId: integer("report_period_id").notNull(),
	unitId: integer("unit_id"),
	serviceAreaId: integer("service_area_id"),
	measureDefId: integer("measure_def_id").notNull(),
	value: varchar({ length: 255 }),
	comments: json(),
	updateMediumId: integer("update_medium_id"),
	statusId: integer("status_id"),
	isRelevant: boolean("is_relevant").default(true).notNull(),
	isDeleted: boolean("is_deleted").default(false).notNull(),
	providerId: integer("provider_id").notNull(),
	technologyId: integer("technology_id").notNull(),
	customerTypeId: integer("customer_type_id").notNull(),
	paymentModeId: integer("payment_mode_id").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedById: text("updated_by_id"),
	powerStationId: integer("power_station_id"),
	utilityId: integer("utility_id"),
	countryId: integer("country_id"),
	subregionId: integer("subregion_id"),
	region: varchar({ length: 255 }),
	valueBoolean: boolean("value_boolean"),
	valueText: text("value_text"),
	categoryId: integer("category_id").notNull(),
	consumptionBandId: integer("consumption_band_id").notNull(),
	divisionId: integer("division_id").notNull(),
	genderId: integer("gender_id").notNull(),
	valueNumeric: numeric("value_numeric"),
	valueOptionId: integer("value_option_id"),
	assetClassId: integer("asset_class_id").notNull(),
	utilityFunctionId: integer("utility_function_id").notNull(),
	noDataReason: varchar("no_data_reason", { length: 32 }),
	multiplier: varchar({ length: 16 }).default('Ones').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.assetClassId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_asset_class_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_category_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.consumptionBandId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_consumption_band_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.countryId],
			foreignColumns: [countries.id],
			name: "data_entries_country_id_countries_id_fk"
		}),
	foreignKey({
			columns: [table.customerTypeId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_customer_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.divisionId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_division_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.genderId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_gender_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.measureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "data_entries_measure_def_id_measure_definitions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentModeId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_payment_mode_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.powerStationId],
			foreignColumns: [powerStations.id],
			name: "data_entries_power_station_id_power_stations_id_fk"
		}),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_provider_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.reportPeriodId],
			foreignColumns: [reportPeriods.id],
			name: "data_entries_report_period_id_report_periods_id_fk"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.serviceAreaId],
			foreignColumns: [serviceAreas.id],
			name: "data_entries_service_area_id_service_areas_id_fk"
		}),
	foreignKey({
			columns: [table.subregionId],
			foreignColumns: [subRegions.id],
			name: "data_entries_subregion_id_sub_regions_id_fk"
		}),
	foreignKey({
			columns: [table.technologyId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_technology_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [units.id],
			name: "data_entries_unit_id_units_id_fk"
		}),
	foreignKey({
			columns: [table.updateMediumId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_update_medium_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "data_entries_updated_by_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.utilityFunctionId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_utility_function_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "data_entries_utility_id_organisations_id_fk"
		}),
	foreignKey({
			columns: [table.valueOptionId],
			foreignColumns: [managedListItems.id],
			name: "data_entries_value_option_id_managed_list_items_id_fk"
		}),
	unique("uniq_entry_address").on(table.reportPeriodId, table.unitId, table.serviceAreaId, table.measureDefId, table.providerId, table.technologyId, table.customerTypeId, table.paymentModeId, table.powerStationId, table.utilityId, table.countryId, table.categoryId, table.consumptionBandId, table.divisionId, table.genderId, table.assetClassId, table.utilityFunctionId),
	check("chk_no_data_reason", sql`(no_data_reason IS NULL) OR ((no_data_reason)::text = ANY ((ARRAY['not_available'::character varying, 'asserted_not_applicable'::character varying])::text[]))`),
	check("chk_one_value", sql`(((
CASE
    WHEN (value_numeric IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (value_boolean IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN (value_text IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN (value_option_id IS NOT NULL) THEN 1
    ELSE 0
END) <= 1`),
	check("chk_value_xor_nodata", sql`(((num_nonnulls(value_numeric, value_boolean, value_text, value_option_id) > 0))::integer + ((no_data_reason IS NOT NULL))::integer) <= 1`),
]);

export const formulaBinding = pgTable("formula_binding", {
	id: serial().primaryKey().notNull(),
	ownerKind: varchar("owner_kind", { length: 16 }).notNull(),
	ownerId: integer("owner_id").notNull(),
	variableName: varchar("variable_name", { length: 255 }).notNull(),
	inputMeasureDefId: integer("input_measure_def_id").notNull(),
	grainMode: varchar("grain_mode", { length: 16 }).default('inherit').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("formula_binding_owner_idx").using("btree", table.ownerKind.asc().nullsLast().op("int4_ops"), table.ownerId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.inputMeasureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "formula_binding_input_measure_def_id_fkey"
		}),
]);

export const formulaBindingDimension = pgTable("formula_binding_dimension", {
	id: serial().primaryKey().notNull(),
	bindingId: integer("binding_id").notNull(),
	dimensionKey: varchar("dimension_key", { length: 32 }).notNull(),
	memberId: integer("member_id"),
}, (table) => [
	uniqueIndex("uq_formula_binding_dimension").using("btree", table.bindingId.asc().nullsLast().op("int4_ops"), table.dimensionKey.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.bindingId],
			foreignColumns: [formulaBinding.id],
			name: "formula_binding_dimension_binding_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [managedListItems.id],
			name: "formula_binding_dimension_member_id_fkey"
		}),
]);

export const aiBenchmark = pgTable("ai_benchmark", {
	id: serial().primaryKey().notNull(),
	kpiName: text("kpi_name").notNull(),
	category: text().notNull(),
	description: text(),
	unit: text().notNull(),
	direction: text().notNull(),
	developingNationBenchmark: integer("developing_nation_benchmark"),
	developedNationBenchmark: integer("developed_nation_benchmark"),
	pacificRegionalAverage: integer("pacific_regional_average"),
	ppaTarget: integer("ppa_target"),
	source: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_benchmark_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("ai_benchmark_kpi_name_idx").using("btree", table.kpiName.asc().nullsLast().op("text_ops")),
	unique("ai_benchmark_kpi_name_unique").on(table.kpiName),
]);

export const aiUsageMetrics = pgTable("ai_usage_metrics", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	date: timestamp({ mode: 'string' }).notNull(),
	requestCount: integer("request_count").default(0).notNull(),
	tokenCount: integer("token_count").default(0).notNull(),
	toolCallCount: integer("tool_call_count").default(0).notNull(),
	errorCount: integer("error_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	tokenCountInput: integer("token_count_input").default(0),
	tokenCountOutput: integer("token_count_output").default(0),
	estimatedCostCents: integer("estimated_cost_cents").default(0),
}, (table) => [
	index("ai_usage_metrics_cost_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.estimatedCostCents.asc().nullsLast().op("text_ops")),
	index("ai_usage_metrics_user_date_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.date.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ai_usage_metrics_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("ai_usage_metrics_user_date_unique").on(table.userId, table.date),
]);

export const bscKpiTargetPlan = pgTable("bsc_kpi_target_plan", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	kpiDefId: integer("kpi_def_id").notNull(),
	frequency: text(),
	startDate: date("start_date"),
	periods: json().default([]).notNull(),
	updatedById: text("updated_by_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("bsc_kpi_target_plan_utility_kpi_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops"), table.kpiDefId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.kpiDefId],
			foreignColumns: [kpiDefinitions.id],
			name: "bsc_kpi_target_plan_kpi_def_id_kpi_definitions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "bsc_kpi_target_plan_updated_by_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_kpi_target_plan_utility_id_organisations_id_fk"
		}).onDelete("cascade"),
]);

export const bscObjectiveLink = pgTable("bsc_objective_link", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilityId: integer("utility_id").notNull(),
	sourceNodeId: uuid("source_node_id").notNull(),
	targetNodeId: uuid("target_node_id").notNull(),
	relation: varchar({ length: 16 }).default('drives').notNull(),
	note: text(),
	ord: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("bsc_objective_link_pair_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops"), table.sourceNodeId.asc().nullsLast().op("uuid_ops"), table.targetNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_objective_link_source_idx").using("btree", table.sourceNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_objective_link_target_idx").using("btree", table.targetNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_objective_link_utility_idx").using("btree", table.utilityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.sourceNodeId],
			foreignColumns: [bscUtilityNode.id],
			name: "bsc_objective_link_source_node_id_bsc_utility_node_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetNodeId],
			foreignColumns: [bscUtilityNode.id],
			name: "bsc_objective_link_target_node_id_bsc_utility_node_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "bsc_objective_link_utility_id_organisations_id_fk"
		}).onDelete("cascade"),
]);

export const bscTemplateLink = pgTable("bsc_template_link", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceNodeId: uuid("source_node_id").notNull(),
	targetNodeId: uuid("target_node_id").notNull(),
	relation: varchar({ length: 16 }).default('drives').notNull(),
	ord: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("bsc_template_link_pair_idx").using("btree", table.sourceNodeId.asc().nullsLast().op("uuid_ops"), table.targetNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_template_link_source_idx").using("btree", table.sourceNodeId.asc().nullsLast().op("uuid_ops")),
	index("bsc_template_link_target_idx").using("btree", table.targetNodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.sourceNodeId],
			foreignColumns: [bscTemplateNode.id],
			name: "bsc_template_link_source_node_id_bsc_template_node_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetNodeId],
			foreignColumns: [bscTemplateNode.id],
			name: "bsc_template_link_target_node_id_bsc_template_node_id_fk"
		}).onDelete("cascade"),
]);

export const uiStyleOverride = pgTable("ui_style_override", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scope: varchar({ length: 32 }).default('global').notNull(),
	styles: json().default({}).notNull(),
	updatedById: text("updated_by_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("ui_style_override_scope_idx").using("btree", table.scope.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "ui_style_override_updated_by_id_user_id_fk"
		}),
]);

export const aiRateLimitWindow = pgTable("ai_rate_limit_window", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	windowType: text("window_type").notNull(),
	windowStart: timestamp("window_start", { mode: 'string' }).notNull(),
	requestCount: integer("request_count").default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_rate_limit_window_user_type_start_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.windowType.asc().nullsLast().op("text_ops"), table.windowStart.asc().nullsLast().op("text_ops")),
]);

export const aiCostBudget = pgTable("ai_cost_budget", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	dailyLimitCents: integer("daily_limit_cents").default(500).notNull(),
	notificationsEnabled: boolean("notifications_enabled").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_cost_budget_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ai_cost_budget_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("ai_cost_budget_user_id_unique").on(table.userId),
]);

export const backupLogs = pgTable("backup_logs", {
	id: serial().primaryKey().notNull(),
	fileSizeBytes: integer("file_size_bytes"),
	success: boolean().default(true).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const alertRules = pgTable("alert_rules", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	category: text().notNull(),
	severityFilter: text("severity_filter"),
	threshold: jsonb(),
	cooldownMinutes: integer("cooldown_minutes").default(60).notNull(),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "alert_rules_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const alertHistory = pgTable("alert_history", {
	id: serial().primaryKey().notNull(),
	ruleId: integer("rule_id").notNull(),
	triggeredAt: timestamp("triggered_at", { mode: 'string' }).defaultNow().notNull(),
	message: text().notNull(),
	dispatched: boolean().default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ruleId],
			foreignColumns: [alertRules.id],
			name: "alert_history_rule_id_alert_rules_id_fk"
		}).onDelete("cascade"),
]);

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	category: text().notNull(),
	title: text().notNull(),
	message: text(),
	link: text(),
	read: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "notifications_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const benchmarkingRequest = pgTable("benchmarking_request", {
	id: serial().primaryKey().notNull(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	benchmarkUtilityId: integer("benchmark_utility_id").notNull(),
	requestingUtilityId: integer("requesting_utility_id").notNull(),
	decisionTypeId: integer("decision_type_id").notNull(),
	decisionById: integer("decision_by_id"),
	decisionDate: timestamp("decision_date", { mode: 'string' }),
	requestExpiry: timestamp("request_expiry", { mode: 'string' }),
}, (table) => [
	index("benchmarking_request_benchmark_idx").using("btree", table.benchmarkUtilityId.asc().nullsLast().op("int4_ops")),
	index("benchmarking_request_requesting_idx").using("btree", table.requestingUtilityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.benchmarkUtilityId],
			foreignColumns: [organisations.id],
			name: "benchmarking_request_benchmark_utility_id_organisations_id_fk"
		}),
	foreignKey({
			columns: [table.decisionTypeId],
			foreignColumns: [managedListItems.id],
			name: "benchmarking_request_decision_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.requestingUtilityId],
			foreignColumns: [organisations.id],
			name: "benchmarking_request_requesting_utility_id_organisations_id_fk"
		}),
]);

export const powerStations = pgTable("power_stations", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	serviceAreaId: integer("service_area_id").notNull(),
	utilityId: integer("utility_id").notNull(),
	commissionedDate: varchar("commissioned_date", { length: 255 }),
	decommissionedDate: varchar("decommissioned_date", { length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.serviceAreaId],
			foreignColumns: [serviceAreas.id],
			name: "power_stations_service_area_id_service_areas_id_fk"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "power_stations_utility_id_organisations_id_fk"
		}),
]);

export const tariffRelevance = pgTable("tariff_relevance", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reportPeriodId: integer("report_period_id").notNull(),
	serviceAreaId: integer("service_area_id").notNull(),
	measureDefId: integer("measure_def_id").notNull(),
	paymentModeId: integer("payment_mode_id").notNull(),
	customerTypeId: integer("customer_type_id").notNull(),
	isRelevant: boolean("is_relevant").default(true).notNull(),
	isDeleted: boolean("is_deleted").default(false).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedById: text("updated_by_id"),
}, (table) => [
	index("uniq_tariff_relevance").using("btree", table.reportPeriodId.asc().nullsLast().op("int4_ops"), table.serviceAreaId.asc().nullsLast().op("int4_ops"), table.measureDefId.asc().nullsLast().op("int4_ops"), table.paymentModeId.asc().nullsLast().op("int4_ops"), table.customerTypeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.customerTypeId],
			foreignColumns: [managedListItems.id],
			name: "tariff_relevance_customer_type_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.measureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "tariff_relevance_measure_def_id_measure_definitions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentModeId],
			foreignColumns: [managedListItems.id],
			name: "tariff_relevance_payment_mode_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.reportPeriodId],
			foreignColumns: [reportPeriods.id],
			name: "tariff_relevance_report_period_id_report_periods_id_fk"
		}),
	foreignKey({
			columns: [table.serviceAreaId],
			foreignColumns: [serviceAreas.id],
			name: "tariff_relevance_service_area_id_service_areas_id_fk"
		}),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "tariff_relevance_updated_by_id_user_id_fk"
		}),
]);

export const transmissionRelevance = pgTable("transmission_relevance", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reportPeriodId: integer("report_period_id").notNull(),
	serviceAreaId: integer("service_area_id").notNull(),
	measureDefId: integer("measure_def_id").notNull(),
	isRelevant: boolean("is_relevant").default(true).notNull(),
	isDeleted: boolean("is_deleted").default(false).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedById: text("updated_by_id"),
}, (table) => [
	index("uniq_transmission_relevance").using("btree", table.reportPeriodId.asc().nullsLast().op("int4_ops"), table.serviceAreaId.asc().nullsLast().op("int4_ops"), table.measureDefId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.measureDefId],
			foreignColumns: [measureDefinitions.id],
			name: "transmission_relevance_measure_def_id_measure_definitions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reportPeriodId],
			foreignColumns: [reportPeriods.id],
			name: "transmission_relevance_report_period_id_report_periods_id_fk"
		}),
	foreignKey({
			columns: [table.serviceAreaId],
			foreignColumns: [serviceAreas.id],
			name: "transmission_relevance_service_area_id_service_areas_id_fk"
		}),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [user.id],
			name: "transmission_relevance_updated_by_id_user_id_fk"
		}),
]);

export const kpiDefinitions = pgTable("kpi_definitions", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: varchar({ length: 255 }),
	formula: varchar(),
	formulaInputs: json("formula_inputs"),
	categoryId: integer("category_id").default(515).notNull(),
	subcategoryId: integer("subcategory_id").default(600),
	strataId: integer("strata_id").default(1).notNull(),
	isAggregated: boolean("is_aggregated").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	unitId: integer("unit_id").default(91).notNull(),
	block: integer().default(60),
	isCurrency: boolean("is_currency").default(false).notNull(),
	isDescriptive: boolean("is_descriptive").default(false).notNull(),
	utilityIds: json("utility_ids"),
	ownerUtilityId: integer("owner_utility_id"),
	type: varchar().default('benchmarking').notNull(),
	limits: json(),
	targets: json(),
	isKpiInput: boolean("is_kpi_input").default(true).notNull(),
	ownerUserId: text("owner_user_id"),
	isPrivate: boolean("is_private").default(false).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	definition: text(),
	synonyms: json(),
	definitionStatus: varchar("definition_status", { length: 16 }),
}, (table) => [
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [managedListItems.id],
			name: "kpi_definitions_category_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [user.id],
			name: "kpi_definitions_owner_user_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.ownerUtilityId],
			foreignColumns: [organisations.id],
			name: "kpi_definitions_owner_utility_id_organisations_id_fk"
		}),
	foreignKey({
			columns: [table.strataId],
			foreignColumns: [managedListItems.id],
			name: "kpi_definitions_strata_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.subcategoryId],
			foreignColumns: [managedListItems.id],
			name: "kpi_definitions_subcategory_id_managed_list_items_id_fk"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [managedListItems.id],
			name: "kpi_definitions_unit_id_managed_list_items_id_fk"
		}),
]);

export const measureDimensionScope = pgTable("measure_dimension_scope", {
	id: serial().primaryKey().notNull(),
	measureId: integer("measure_id").notNull(),
	dimension: varchar({ length: 32 }).notNull(),
	expansionMode: varchar("expansion_mode", { length: 16 }).notNull(),
}, (table) => [
	uniqueIndex("uq_scope").using("btree", table.measureId.asc().nullsLast().op("int4_ops"), table.dimension.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.measureId],
			foreignColumns: [measureDefinitions.id],
			name: "measure_dimension_scope_measure_id_measure_definitions_id_fk"
		}).onDelete("cascade"),
]);

export const sectors = pgTable("sectors", {
	id: integer().primaryKey().notNull(),
	code: varchar({ length: 32 }).notNull(),
	name: varchar({ length: 64 }).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	unique("sectors_code_unique").on(table.code),
]);

export const measureDimensionApplicability = pgTable("measure_dimension_applicability", {
	id: serial().primaryKey().notNull(),
	measureId: integer("measure_id").notNull(),
	dimension: varchar({ length: 24 }).notNull(),
	memberId: integer("member_id").notNull(),
	effectiveFrom: date("effective_from"),
	effectiveTo: date("effective_to"),
}, (table) => [
	foreignKey({
			columns: [table.measureId],
			foreignColumns: [measureDefinitions.id],
			name: "measure_dimension_applicability_measure_id_measure_definitions_"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [managedListItems.id],
			name: "measure_dimension_applicability_member_id_managed_list_items_id"
		}),
	unique("uq_mda").on(table.measureId, table.dimension, table.memberId),
	check("chk_mda_eff_order", sql`(effective_from IS NULL) OR (effective_to IS NULL) OR (effective_to >= effective_from)`),
]);

export const kpiActual = pgTable("kpi_actual", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kpiDefId: integer("kpi_def_id").notNull(),
	periodId: integer("period_id").notNull(),
	utilityId: integer("utility_id"),
	countryId: integer("country_id"),
	subregionId: integer("subregion_id"),
	region: text().notNull(),
	serviceAreaId: integer("service_area_id"),
	powerStationId: integer("power_station_id"),
	unitId: integer("unit_id"),
	providerId: integer("provider_id").notNull(),
	categoryId: integer("category_id").notNull(),
	technologyId: integer("technology_id").notNull(),
	assetClassId: integer("asset_class_id").notNull(),
	customerTypeId: integer("customer_type_id").notNull(),
	paymentModeId: integer("payment_mode_id").notNull(),
	consumptionBandId: integer("consumption_band_id").notNull(),
	divisionId: integer("division_id").notNull(),
	genderId: integer("gender_id").notNull(),
	utilityFunctionId: integer("utility_function_id").notNull(),
	value: numeric(),
	noDataReason: varchar("no_data_reason", { length: 32 }),
	computedAt: timestamp("computed_at", { mode: 'string' }),
	formulaVersion: varchar("formula_version"),
	owningOrgId: integer("owning_org_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
	grainLevel: text("grain_level").generatedAlwaysAs(sql`
CASE
    WHEN (unit_id IS NOT NULL) THEN 'unit'::text
    WHEN (power_station_id IS NOT NULL) THEN 'station'::text
    WHEN (service_area_id IS NOT NULL) THEN 'area'::text
    WHEN (utility_id IS NOT NULL) THEN 'utility'::text
    WHEN (country_id IS NOT NULL) THEN 'country'::text
    WHEN (subregion_id IS NOT NULL) THEN 'subregion'::text
    ELSE 'region'::text
END`),
}, (table) => [
	index("ix_ka_grain").using("btree", table.grainLevel.asc().nullsLast().op("text_ops")),
	index("ix_ka_kpi_period").using("btree", table.kpiDefId.asc().nullsLast().op("int4_ops"), table.periodId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("uq_ka_address").using("btree", table.kpiDefId.asc().nullsLast().op("int4_ops"), table.periodId.asc().nullsLast().op("int4_ops"), table.utilityId.asc().nullsLast().op("text_ops"), table.countryId.asc().nullsLast().op("text_ops"), table.subregionId.asc().nullsLast().op("int4_ops"), table.region.asc().nullsLast().op("text_ops"), table.serviceAreaId.asc().nullsLast().op("text_ops"), table.powerStationId.asc().nullsLast().op("text_ops"), table.unitId.asc().nullsLast().op("text_ops"), table.providerId.asc().nullsLast().op("text_ops"), table.categoryId.asc().nullsLast().op("int4_ops"), table.technologyId.asc().nullsLast().op("text_ops"), table.assetClassId.asc().nullsLast().op("text_ops"), table.customerTypeId.asc().nullsLast().op("int4_ops"), table.paymentModeId.asc().nullsLast().op("text_ops"), table.consumptionBandId.asc().nullsLast().op("text_ops"), table.divisionId.asc().nullsLast().op("text_ops"), table.genderId.asc().nullsLast().op("text_ops"), table.utilityFunctionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assetClassId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_asset_class_id_fkey"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_category_id_fkey"
		}),
	foreignKey({
			columns: [table.consumptionBandId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_consumption_band_id_fkey"
		}),
	foreignKey({
			columns: [table.countryId],
			foreignColumns: [countries.id],
			name: "kpi_actual_country_id_fkey"
		}),
	foreignKey({
			columns: [table.customerTypeId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_customer_type_id_fkey"
		}),
	foreignKey({
			columns: [table.divisionId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_division_id_fkey"
		}),
	foreignKey({
			columns: [table.genderId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_gender_id_fkey"
		}),
	foreignKey({
			columns: [table.kpiDefId],
			foreignColumns: [kpiDefinitions.id],
			name: "kpi_actual_kpi_def_id_fkey"
		}),
	foreignKey({
			columns: [table.owningOrgId],
			foreignColumns: [organisations.id],
			name: "kpi_actual_owning_org_id_fkey"
		}),
	foreignKey({
			columns: [table.paymentModeId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_payment_mode_id_fkey"
		}),
	foreignKey({
			columns: [table.powerStationId],
			foreignColumns: [powerStations.id],
			name: "kpi_actual_power_station_id_fkey"
		}),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_provider_id_fkey"
		}),
	foreignKey({
			columns: [table.serviceAreaId],
			foreignColumns: [serviceAreas.id],
			name: "kpi_actual_service_area_id_fkey"
		}),
	foreignKey({
			columns: [table.subregionId],
			foreignColumns: [subRegions.id],
			name: "kpi_actual_subregion_id_fkey"
		}),
	foreignKey({
			columns: [table.technologyId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_technology_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [units.id],
			name: "kpi_actual_unit_id_fkey"
		}),
	foreignKey({
			columns: [table.utilityFunctionId],
			foreignColumns: [managedListItems.id],
			name: "kpi_actual_utility_function_id_fkey"
		}),
	foreignKey({
			columns: [table.utilityId],
			foreignColumns: [organisations.id],
			name: "kpi_actual_utility_id_fkey"
		}),
	check("chk_ka_grain_level", sql`grain_level = ANY (ARRAY['unit'::text, 'station'::text, 'area'::text, 'utility'::text, 'country'::text, 'subregion'::text, 'region'::text])`),
	check("chk_ka_no_data_reason", sql`(no_data_reason IS NULL) OR ((no_data_reason)::text = ANY ((ARRAY['not_available'::character varying, 'asserted_not_applicable'::character varying])::text[]))`),
	check("chk_ka_value_xor_nodata", sql`(((value IS NOT NULL))::integer + ((no_data_reason IS NOT NULL))::integer) <= 1`),
]);
