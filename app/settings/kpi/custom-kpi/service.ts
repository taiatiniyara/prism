import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  CustomKpiDecisionType,
  CustomKpiEmailDeliveryStatus,
  CustomKpiProposedInput,
  CustomKpiProposedUnit,
  CustomKpiRequest,
  CustomKpiLifecycleEventType,
  CustomKpiRequestStatus,
  customKpiEmailDeliveries,
  customKpiLifecycleEvents,
  customKpiDecisions,
  customKpiRequests,
} from "@/db/schema/custom-kpi-requests";
import { inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { organisations } from "@/db/schema/utility";
import { roles, user } from "@/db/schema/auth-schema";
import {
  buildCustomKpiSubmissionReviewEmail,
  buildCustomKpiReviewOutcomeEmail,
  sendEmail,
} from "@/lib/email.service";

const normalize = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export const buildCustomKpiDefinitionFingerprint = (input: {
  title: string;
  isPrivate?: boolean;
  formulaExpression: string;
  unitId: number;
  proposedUnits?: CustomKpiProposedUnit[];
  proposedInputs?: CustomKpiProposedInput[];
  selectedInputDefinitionIds?: number[];
}): string =>
  [
    normalize(input.title),
    input.isPrivate ? "1" : "0",
    normalize(input.formulaExpression),
    String(input.unitId),
    JSON.stringify(input.proposedUnits ?? []),
    JSON.stringify(input.proposedInputs ?? []),
    [...(input.selectedInputDefinitionIds ?? [])]
      .sort((a, b) => a - b)
      .join(","),
  ].join("::");

export const isDuplicatePendingCustomKpiSubmission = async (input: {
  submitterUserId: string;
  title: string;
  isPrivate?: boolean;
  formulaExpression: string;
  unitId: number;
  proposedUnits?: CustomKpiProposedUnit[];
  proposedInputs?: CustomKpiProposedInput[];
  selectedInputDefinitionIds?: number[];
}): Promise<boolean> => {
  const definitionFingerprint = buildCustomKpiDefinitionFingerprint(input);

  const existing = await db
    .select({ id: customKpiRequests.id })
    .from(customKpiRequests)
    .where(
      and(
        eq(customKpiRequests.submitter_user_id, input.submitterUserId),
        eq(customKpiRequests.definition_fingerprint, definitionFingerprint),
        eq(customKpiRequests.status, "PENDING_REVIEW"),
      ),
    )
    .limit(1);

  return existing.length > 0;
};

export const canTransitionCustomKpiStatus = (
  from: CustomKpiRequestStatus,
  to: CustomKpiRequestStatus,
  options?: { override?: boolean },
): boolean => {
  if (from === to) {
    return true;
  }

  if (from === "PENDING_REVIEW") {
    return to === "APPROVED" || to === "REJECTED" || to === "REPLACED";
  }

  return options?.override === true;
};

export const assertValidCustomKpiStatusTransition = (
  from: CustomKpiRequestStatus,
  to: CustomKpiRequestStatus,
  options?: { override?: boolean },
): void => {
  if (!canTransitionCustomKpiStatus(from, to, options)) {
    throw new Error(
      `VALIDATION:Invalid custom KPI status transition from ${from} to ${to}.`,
    );
  }
};

export const recordCustomKpiLifecycleEvent = async (input: {
  requestId: string;
  eventType: CustomKpiLifecycleEventType;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> => {
  await db.insert(customKpiLifecycleEvents).values({
    request_id: input.requestId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    metadata_json: input.metadata ?? null,
  });
};

export type CreateCustomKpiRequestInput = {
  title: string;
  description: string | null;
  isPrivate: boolean;
  formulaExpression: string;
  unitId: number;
  proposedUnits: CustomKpiProposedUnit[];
  proposedInputs: CustomKpiProposedInput[];
  selectedInputDefinitionIds: number[];
};

export type CustomKpiInputOption = {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
  category: string | null;
  subcategory: string | null;
};

export type CustomKpiUnitOption = {
  id: number;
  name: string;
};

export type CustomKpiDataTypeOption = {
  id: number;
  name: string;
};

export type CustomKpiRequestListItem = Pick<
  CustomKpiRequest,
  | "id"
  | "title"
  | "description"
  | "is_private"
  | "formula_expression"
  | "unit_id"
  | "proposed_units"
  | "proposed_inputs"
  | "status"
  | "visibility_scope"
  | "replacement_kpi_def_id"
  | "selected_input_definition_ids"
  | "created_at"
  | "updated_at"
> & {
  selectedInputs: Array<{
    id: number;
    name: string;
    unit: string | null;
    variableName: string | null;
  }>;
};

const assertCustomKpiUnitIdIsValid = async (unitId: number) => {
  const [unit] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.id, unitId),
        eq(managedListItems.is_active, true),
        inArray(managedLists.name, ["Unit", "Units", "unit", "units"]),
      ),
    )
    .limit(1);

  if (!unit) {
    throw new Error("VALIDATION:Selected unit ID is invalid.");
  }
};

export const assertCustomKpiRequestCreateAccess = (userId: string | null) => {
  if (!userId) {
    throw new Error(
      "FORBIDDEN:You are not allowed to create custom KPI requests.",
    );
  }
};

const assertSelectedInputDefinitionIdsAreValid = async (
  selectedInputDefinitionIds: number[],
) => {
  if (selectedInputDefinitionIds.length === 0) {
    return;
  }

  const existing = await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(
      and(
        inArray(inputDefinitions.id, selectedInputDefinitionIds),
        eq(inputDefinitions.is_active, true),
      ),
    );

  const existingSet = new Set(existing.map((row) => row.id));
  const missing = selectedInputDefinitionIds.filter(
    (id) => !existingSet.has(id),
  );
  if (missing.length > 0) {
    throw new Error(
      "VALIDATION:One or more selected input definitions are invalid or inactive.",
    );
  }
};

export const listCustomKpiInputOptions = async (): Promise<
  CustomKpiInputOption[]
> => {
  const rows = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variableName: inputDefinitions.variable_name,
      unitId: inputDefinitions.unit_id,
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
    })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true))
    .orderBy(asc(inputDefinitions.name));

  const managedListIds = [
    ...new Set(
      rows.flatMap((row) => [row.unitId, row.categoryId, row.subcategoryId]),
    ),
  ];

  const managedNames =
    managedListIds.length > 0
      ? await db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
          })
          .from(managedListItems)
          .where(inArray(managedListItems.id, managedListIds))
      : [];

  const managedNameById = new Map(
    managedNames.map((item) => [item.id, item.name]),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    variableName: row.variableName,
    unit: managedNameById.get(row.unitId) ?? null,
    category: managedNameById.get(row.categoryId) ?? null,
    subcategory: managedNameById.get(row.subcategoryId) ?? null,
  }));
};

export const listCustomKpiUnitOptions = async (): Promise<
  CustomKpiUnitOption[]
> => {
  return db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        inArray(managedLists.name, ["Unit", "Units", "unit", "units"]),
        eq(managedListItems.is_active, true),
      ),
    )
    .orderBy(asc(managedListItems.name));
};

export const listCustomKpiDataTypeOptions = async (): Promise<
  CustomKpiDataTypeOption[]
> => {
  return db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        inArray(managedLists.name, ["Data Type", "Data Types"]),
        eq(managedListItems.is_active, true),
      ),
    )
    .orderBy(asc(managedListItems.name));
};

export const listCustomKpiProposalReferenceOptions = async () => {
  const [availableInputDefinitions, availableUnits, availableDataTypes] =
    await Promise.all([
      listCustomKpiInputOptions(),
      listCustomKpiUnitOptions(),
      listCustomKpiDataTypeOptions(),
    ]);

  return {
    availableInputDefinitions,
    availableUnits,
    availableDataTypes,
  };
};

const notifyDevUsersOfCustomKpiSubmission = async (input: {
  requestId: string;
  submitterUserId: string;
  title: string;
}) => {
  const [submitter] = await db
    .select({
      name: user.name,
      email: user.email,
      organisationAcronym: organisations.acronym,
    })
    .from(user)
    .leftJoin(organisations, eq(user.organisation_id, organisations.id))
    .where(eq(user.id, input.submitterUserId))
    .limit(1);

  const devRecipients = await db
    .select({
      id: user.id,
      email: user.email,
    })
    .from(user)
    .innerJoin(roles, eq(user.role_id, roles.id))
    .where(and(eq(roles.name, "DEV"), eq(user.status, "active")));

  if (devRecipients.length === 0) {
    return;
  }

  const message = buildCustomKpiSubmissionReviewEmail({
    title: input.title,
    submitterName: submitter?.name ?? null,
    submitterEmail: submitter?.email ?? null,
    submitterOrganisationAcronym: submitter?.organisationAcronym ?? null,
  });

  const results = await Promise.allSettled(
    devRecipients.map((recipient) =>
      sendEmail({
        to: recipient.email,
        subject: message.subject,
        html: message.html,
      }),
    ),
  );

  const sentCount = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const failedCount = results.length - sentCount;

  if (sentCount > 0) {
    await recordCustomKpiLifecycleEvent({
      requestId: input.requestId,
      eventType: "EMAIL_DISPATCHED",
      actorUserId: input.submitterUserId,
      metadata: {
        notificationType: "DEV_REVIEW_REQUEST",
        sentCount,
      },
    });
  }

  if (failedCount > 0) {
    await recordCustomKpiLifecycleEvent({
      requestId: input.requestId,
      eventType: "EMAIL_DISPATCH_FAILED",
      actorUserId: input.submitterUserId,
      metadata: {
        notificationType: "DEV_REVIEW_REQUEST",
        failedCount,
      },
    });
  }
};

export const createCustomKpiRequest = async (
  submitterUserId: string,
  input: CreateCustomKpiRequestInput,
): Promise<CustomKpiRequestListItem> => {
  assertCustomKpiRequestCreateAccess(submitterUserId);
  await assertCustomKpiUnitIdIsValid(input.unitId);
  await assertSelectedInputDefinitionIdsAreValid(
    input.selectedInputDefinitionIds,
  );

  const isDuplicate = await isDuplicatePendingCustomKpiSubmission({
    submitterUserId,
    title: input.title,
    isPrivate: input.isPrivate,
    formulaExpression: input.formulaExpression,
    unitId: input.unitId,
    proposedUnits: input.proposedUnits,
    proposedInputs: input.proposedInputs,
    selectedInputDefinitionIds: input.selectedInputDefinitionIds,
  });

  if (isDuplicate) {
    throw new Error(
      "VALIDATION:A pending custom KPI request with the same definition already exists.",
    );
  }

  const definitionFingerprint = buildCustomKpiDefinitionFingerprint({
    title: input.title,
    isPrivate: input.isPrivate,
    formulaExpression: input.formulaExpression,
    unitId: input.unitId,
    proposedUnits: input.proposedUnits,
    proposedInputs: input.proposedInputs,
    selectedInputDefinitionIds: input.selectedInputDefinitionIds,
  });

  const [created] = await db
    .insert(customKpiRequests)
    .values({
      submitter_user_id: submitterUserId,
      title: input.title,
      description: input.description,
      formula_expression: input.formulaExpression,
      is_private: input.isPrivate,
      unit_id: input.unitId,
      proposed_units: input.proposedUnits,
      proposed_inputs: input.proposedInputs,
      selected_input_definition_ids: input.selectedInputDefinitionIds,
      definition_fingerprint: definitionFingerprint,
      status: "PENDING_REVIEW",
      visibility_scope: "SUBMITTER_ONLY",
    })
    .returning({
      id: customKpiRequests.id,
      title: customKpiRequests.title,
      description: customKpiRequests.description,
      is_private: customKpiRequests.is_private,
      formula_expression: customKpiRequests.formula_expression,
      unit_id: customKpiRequests.unit_id,
      proposed_units: customKpiRequests.proposed_units,
      proposed_inputs: customKpiRequests.proposed_inputs,
      status: customKpiRequests.status,
      visibility_scope: customKpiRequests.visibility_scope,
      replacement_kpi_def_id: customKpiRequests.replacement_kpi_def_id,
      selected_input_definition_ids:
        customKpiRequests.selected_input_definition_ids,
      created_at: customKpiRequests.created_at,
      updated_at: customKpiRequests.updated_at,
    });

  const createdSelectedInputIds = Array.isArray(
    created.selected_input_definition_ids,
  )
    ? created.selected_input_definition_ids
    : [];
  const createdSelectedInputRows =
    createdSelectedInputIds.length > 0
      ? await db
          .select({
            id: inputDefinitions.id,
            name: inputDefinitions.name,
            unit: managedListItems.name,
            variableName: inputDefinitions.variable_name,
          })
          .from(inputDefinitions)
          .leftJoin(
            managedListItems,
            eq(inputDefinitions.unit_id, managedListItems.id),
          )
          .where(inArray(inputDefinitions.id, createdSelectedInputIds))
      : [];
  const createdSelectedInputById = new Map(
    createdSelectedInputRows.map((row) => [row.id, row]),
  );

  await recordCustomKpiLifecycleEvent({
    requestId: created.id,
    eventType: "REQUEST_SUBMITTED",
    actorUserId: submitterUserId,
    metadata: {
      title: created.title,
    },
  });

  // SC-001 queue latency telemetry starts at submission time.
  console.info("metric.custom_kpi.queue_latency_ms", {
    requestId: created.id,
    latencyMs: 0,
  });

  try {
    await notifyDevUsersOfCustomKpiSubmission({
      requestId: created.id,
      submitterUserId,
      title: created.title,
    });
  } catch (error) {
    console.error("Failed to notify DEV users about custom KPI submission", {
      requestId: created.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return {
    ...created,
    selectedInputs: createdSelectedInputIds
      .map((id) => createdSelectedInputById.get(id))
      .filter(
        (
          item,
        ): item is {
          id: number;
          name: string;
          unit: string | null;
          variableName: string | null;
        } => Boolean(item),
      ),
  };
};

export const listMyCustomKpiRequests = async (
  submitterUserId: string,
): Promise<CustomKpiRequestListItem[]> => {
  assertCustomKpiRequestCreateAccess(submitterUserId);

  const requests = await db
    .select({
      id: customKpiRequests.id,
      title: customKpiRequests.title,
      description: customKpiRequests.description,
      is_private: customKpiRequests.is_private,
      formula_expression: customKpiRequests.formula_expression,
      unit_id: customKpiRequests.unit_id,
      proposed_units: customKpiRequests.proposed_units,
      proposed_inputs: customKpiRequests.proposed_inputs,
      status: customKpiRequests.status,
      visibility_scope: customKpiRequests.visibility_scope,
      replacement_kpi_def_id: customKpiRequests.replacement_kpi_def_id,
      selected_input_definition_ids:
        customKpiRequests.selected_input_definition_ids,
      created_at: customKpiRequests.created_at,
      updated_at: customKpiRequests.updated_at,
    })
    .from(customKpiRequests)
    .where(eq(customKpiRequests.submitter_user_id, submitterUserId))
    .orderBy(desc(customKpiRequests.created_at));

  if (requests.length === 0) {
    return [];
  }

  const selectedInputDefinitionIds = [
    ...new Set(
      requests.flatMap((request) =>
        Array.isArray(request.selected_input_definition_ids)
          ? request.selected_input_definition_ids
          : [],
      ),
    ),
  ];

  const selectedInputRows =
    selectedInputDefinitionIds.length > 0
      ? await db
          .select({
            id: inputDefinitions.id,
            name: inputDefinitions.name,
            unit: managedListItems.name,
            variableName: inputDefinitions.variable_name,
          })
          .from(inputDefinitions)
          .leftJoin(
            managedListItems,
            eq(inputDefinitions.unit_id, managedListItems.id),
          )
          .where(inArray(inputDefinitions.id, selectedInputDefinitionIds))
      : [];
  const selectedInputById = new Map(
    selectedInputRows.map((row) => [row.id, row]),
  );

  return requests.map((request) => ({
    ...request,
    selectedInputs: (Array.isArray(request.selected_input_definition_ids)
      ? request.selected_input_definition_ids
      : []
    )
      .map((id) => selectedInputById.get(id))
      .filter(
        (
          item,
        ): item is {
          id: number;
          name: string;
          unit: string | null;
          variableName: string | null;
        } => Boolean(item),
      ),
  }));
};

export const getCustomKpiPageViewModel = async (submitterUserId: string) => {
  const [
    requests,
    availableInputDefinitions,
    availableUnits,
    availableDataTypes,
  ] = await Promise.all([
    listMyCustomKpiRequests(submitterUserId),
    listCustomKpiInputOptions(),
    listCustomKpiUnitOptions(),
    listCustomKpiDataTypeOptions(),
  ]);

  return {
    requests,
    availableInputDefinitions,
    availableUnits,
    availableDataTypes,
  };
};

export type CustomKpiReviewQueueItem = Pick<
  CustomKpiRequest,
  | "id"
  | "submitter_user_id"
  | "title"
  | "description"
  | "is_private"
  | "formula_expression"
  | "unit_id"
  | "proposed_units"
  | "proposed_inputs"
  | "selected_input_definition_ids"
  | "status"
  | "visibility_scope"
  | "replacement_kpi_def_id"
  | "created_at"
  | "updated_at"
> & {
  latestDecisionId: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterRole: string | null;
  submitterOrganisationAcronym: string | null;
  selectedInputs: Array<{
    id: number;
    name: string;
    unit: string | null;
  }>;
};

export const listCustomKpiReviewQueue = async (): Promise<
  CustomKpiReviewQueueItem[]
> => {
  const requests = await db
    .select({
      id: customKpiRequests.id,
      submitter_user_id: customKpiRequests.submitter_user_id,
      title: customKpiRequests.title,
      description: customKpiRequests.description,
      is_private: customKpiRequests.is_private,
      formula_expression: customKpiRequests.formula_expression,
      unit_id: customKpiRequests.unit_id,
      proposed_units: customKpiRequests.proposed_units,
      proposed_inputs: customKpiRequests.proposed_inputs,
      selected_input_definition_ids:
        customKpiRequests.selected_input_definition_ids,
      status: customKpiRequests.status,
      visibility_scope: customKpiRequests.visibility_scope,
      replacement_kpi_def_id: customKpiRequests.replacement_kpi_def_id,
      created_at: customKpiRequests.created_at,
      updated_at: customKpiRequests.updated_at,
    })
    .from(customKpiRequests)
    .orderBy(desc(customKpiRequests.created_at))
    .limit(100);

  if (requests.length === 0) {
    return [];
  }

  const oldestPending = requests
    .filter((request) => request.status === "PENDING_REVIEW")
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];
  if (oldestPending) {
    console.info("metric.custom_kpi.queue_latency_ms", {
      requestId: oldestPending.id,
      latencyMs: Date.now() - oldestPending.created_at.getTime(),
    });
  }

  const requestIds = requests.map((request) => request.id);
  const decisions = await db
    .select({
      id: customKpiDecisions.id,
      request_id: customKpiDecisions.request_id,
      created_at: customKpiDecisions.created_at,
    })
    .from(customKpiDecisions)
    .where(inArray(customKpiDecisions.request_id, requestIds))
    .orderBy(desc(customKpiDecisions.created_at));

  const latestDecisionByRequest = new Map<string, string>();
  for (const decision of decisions) {
    if (!latestDecisionByRequest.has(decision.request_id)) {
      latestDecisionByRequest.set(decision.request_id, decision.id);
    }
  }

  const submitterIds = [
    ...new Set(requests.map((request) => request.submitter_user_id)),
  ];
  const submitters = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: roles.name,
      organisationAcronym: organisations.acronym,
    })
    .from(user)
    .leftJoin(roles, eq(user.role_id, roles.id))
    .leftJoin(organisations, eq(user.organisation_id, organisations.id))
    .where(inArray(user.id, submitterIds));
  const submitterById = new Map(
    submitters.map((submitter) => [submitter.id, submitter]),
  );

  const selectedInputDefinitionIds = [
    ...new Set(
      requests.flatMap((request) =>
        Array.isArray(request.selected_input_definition_ids)
          ? request.selected_input_definition_ids
          : [],
      ),
    ),
  ];

  const selectedInputRows =
    selectedInputDefinitionIds.length > 0
      ? await db
          .select({
            id: inputDefinitions.id,
            name: inputDefinitions.name,
            unit: managedListItems.name,
          })
          .from(inputDefinitions)
          .leftJoin(
            managedListItems,
            eq(inputDefinitions.unit_id, managedListItems.id),
          )
          .where(inArray(inputDefinitions.id, selectedInputDefinitionIds))
      : [];
  const selectedInputById = new Map(
    selectedInputRows.map((row) => [row.id, row]),
  );

  return requests.map((request) => ({
    ...request,
    latestDecisionId: latestDecisionByRequest.get(request.id) ?? null,
    submitterName: submitterById.get(request.submitter_user_id)?.name ?? null,
    submitterEmail: submitterById.get(request.submitter_user_id)?.email ?? null,
    submitterRole: submitterById.get(request.submitter_user_id)?.role ?? null,
    submitterOrganisationAcronym:
      submitterById.get(request.submitter_user_id)?.organisationAcronym ?? null,
    selectedInputs: (Array.isArray(request.selected_input_definition_ids)
      ? request.selected_input_definition_ids
      : []
    )
      .map((id) => selectedInputById.get(id))
      .filter(
        (item): item is { id: number; name: string; unit: string | null } =>
          Boolean(item),
      ),
  }));
};

const MAX_CUSTOM_KPI_EMAIL_ATTEMPTS = 3;
const EMAIL_RETRY_BASE_DELAY_MS = 5 * 60 * 1000;

export const resolveCustomKpiEmailFailureState = (
  attemptCount: number,
): CustomKpiEmailDeliveryStatus =>
  attemptCount >= MAX_CUSTOM_KPI_EMAIL_ATTEMPTS
    ? "FAILED_FINAL"
    : "FAILED_RETRYABLE";

export const calculateNextCustomKpiEmailAttemptAt = (
  attemptCount: number,
  fromDate = new Date(),
): Date | null => {
  if (attemptCount >= MAX_CUSTOM_KPI_EMAIL_ATTEMPTS) {
    return null;
  }

  const delay = EMAIL_RETRY_BASE_DELAY_MS * Math.max(attemptCount, 1);
  return new Date(fromDate.getTime() + delay);
};

export const enqueueCustomKpiDecisionOutcomeEmail = async (input: {
  requestId: string;
  decisionId: string;
}): Promise<void> => {
  const [existing] = await db
    .select({ id: customKpiEmailDeliveries.id })
    .from(customKpiEmailDeliveries)
    .where(eq(customKpiEmailDeliveries.decision_id, input.decisionId))
    .limit(1);

  if (existing) {
    return;
  }

  const [request] = await db
    .select({
      submitterUserId: customKpiRequests.submitter_user_id,
    })
    .from(customKpiRequests)
    .where(eq(customKpiRequests.id, input.requestId))
    .limit(1);

  if (!request) {
    throw new Error("VALIDATION:Custom KPI request does not exist.");
  }

  const [decision] = await db
    .select({ decisionType: customKpiDecisions.decision_type })
    .from(customKpiDecisions)
    .where(eq(customKpiDecisions.id, input.decisionId))
    .limit(1);

  if (!decision) {
    throw new Error("VALIDATION:Custom KPI decision does not exist.");
  }

  const [submitter] = await db
    .select({ organisationId: user.organisation_id })
    .from(user)
    .where(eq(user.id, request.submitterUserId))
    .limit(1);

  const shouldNotifyOrganisation =
    decision.decisionType === "APPROVE" && submitter?.organisationId != null;

  let recipientRows: Array<{ email: string }> = [];
  if (shouldNotifyOrganisation && submitter?.organisationId != null) {
    recipientRows = await db
      .select({ email: user.email })
      .from(user)
      .where(
        and(
          eq(user.organisation_id, submitter.organisationId),
          eq(user.status, "active"),
        ),
      );
  } else {
    recipientRows = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, request.submitterUserId))
      .limit(1);
  }

  const recipientEmails = [...new Set(recipientRows.map((row) => row.email))];

  if (recipientEmails.length === 0) {
    throw new Error("VALIDATION:Unable to resolve outcome email recipients.");
  }

  await db.insert(customKpiEmailDeliveries).values(
    recipientEmails.map((email) => ({
      request_id: input.requestId,
      decision_id: input.decisionId,
      recipient_email: email,
      delivery_status: "PENDING" as const,
      attempt_count: 0,
      next_attempt_at: new Date(),
    })),
  );
};

const dispatchCustomKpiOutcomeEmailDelivery = async (deliveryId: string) => {
  const [delivery] = await db
    .select({
      id: customKpiEmailDeliveries.id,
      requestId: customKpiEmailDeliveries.request_id,
      decisionId: customKpiEmailDeliveries.decision_id,
      recipientEmail: customKpiEmailDeliveries.recipient_email,
      attemptCount: customKpiEmailDeliveries.attempt_count,
      createdAt: customKpiEmailDeliveries.created_at,
      updatedAt: customKpiEmailDeliveries.updated_at,
      requestTitle: customKpiRequests.title,
      decisionType: customKpiDecisions.decision_type,
      rationale: customKpiDecisions.rationale,
    })
    .from(customKpiEmailDeliveries)
    .innerJoin(
      customKpiRequests,
      eq(customKpiEmailDeliveries.request_id, customKpiRequests.id),
    )
    .innerJoin(
      customKpiDecisions,
      eq(customKpiEmailDeliveries.decision_id, customKpiDecisions.id),
    )
    .where(eq(customKpiEmailDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) {
    return { dispatched: 0, failed: 0 };
  }

  try {
    const message = buildCustomKpiReviewOutcomeEmail({
      title: delivery.requestTitle,
      decisionType: delivery.decisionType as CustomKpiDecisionType,
      rationale: delivery.rationale,
    });

    await sendEmail({
      to: delivery.recipientEmail,
      subject: message.subject,
      html: message.html,
    });

    await db
      .update(customKpiEmailDeliveries)
      .set({
        delivery_status: "SENT",
        attempt_count: delivery.attemptCount + 1,
        last_error: null,
        next_attempt_at: null,
        sent_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(customKpiEmailDeliveries.id, delivery.id));

    await recordCustomKpiLifecycleEvent({
      requestId: delivery.requestId,
      eventType: "EMAIL_DISPATCHED",
      metadata: {
        decisionId: delivery.decisionId,
        deliveryId: delivery.id,
      },
    });

    const emailDispatchLatencyMs = Math.max(
      0,
      Date.now() - delivery.createdAt.getTime(),
    );
    console.info("metric.custom_kpi.email_dispatch_latency_ms", {
      requestId: delivery.requestId,
      deliveryId: delivery.id,
      latencyMs: emailDispatchLatencyMs,
    });

    return { dispatched: 1, failed: 0 };
  } catch (error) {
    const nextAttemptCount = delivery.attemptCount + 1;
    const nextStatus = resolveCustomKpiEmailFailureState(nextAttemptCount);
    const nextAttemptAt =
      calculateNextCustomKpiEmailAttemptAt(nextAttemptCount);
    const message =
      error instanceof Error ? error.message : "Unknown email delivery error";

    await db
      .update(customKpiEmailDeliveries)
      .set({
        delivery_status: nextStatus,
        attempt_count: nextAttemptCount,
        last_error: message,
        next_attempt_at: nextAttemptAt,
        updated_at: new Date(),
      })
      .where(eq(customKpiEmailDeliveries.id, delivery.id));

    await recordCustomKpiLifecycleEvent({
      requestId: delivery.requestId,
      eventType: "EMAIL_DISPATCH_FAILED",
      metadata: {
        decisionId: delivery.decisionId,
        deliveryId: delivery.id,
        attemptCount: nextAttemptCount,
        status: nextStatus,
        error: message,
      },
    });

    return { dispatched: 0, failed: 1 };
  }
};

export const processPendingCustomKpiOutcomeEmails = async (
  limit = 25,
): Promise<{ processed: number; dispatched: number; failed: number }> => {
  const now = new Date();
  const deliveries = await db
    .select({ id: customKpiEmailDeliveries.id })
    .from(customKpiEmailDeliveries)
    .where(
      and(
        or(
          eq(customKpiEmailDeliveries.delivery_status, "PENDING"),
          eq(customKpiEmailDeliveries.delivery_status, "FAILED_RETRYABLE"),
        ),
        or(
          isNull(customKpiEmailDeliveries.next_attempt_at),
          lte(customKpiEmailDeliveries.next_attempt_at, now),
        ),
      ),
    )
    .orderBy(customKpiEmailDeliveries.created_at)
    .limit(limit);

  let dispatched = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const result = await dispatchCustomKpiOutcomeEmailDelivery(delivery.id);
    dispatched += result.dispatched;
    failed += result.failed;
  }

  return {
    processed: deliveries.length,
    dispatched,
    failed,
  };
};

export const processPendingCustomKpiOutcomeEmailsForDecision = async (
  decisionId: string,
  limit = 100,
): Promise<{ processed: number; dispatched: number; failed: number }> => {
  const now = new Date();
  const deliveries = await db
    .select({ id: customKpiEmailDeliveries.id })
    .from(customKpiEmailDeliveries)
    .where(
      and(
        eq(customKpiEmailDeliveries.decision_id, decisionId),
        or(
          eq(customKpiEmailDeliveries.delivery_status, "PENDING"),
          eq(customKpiEmailDeliveries.delivery_status, "FAILED_RETRYABLE"),
        ),
        or(
          isNull(customKpiEmailDeliveries.next_attempt_at),
          lte(customKpiEmailDeliveries.next_attempt_at, now),
        ),
      ),
    )
    .orderBy(customKpiEmailDeliveries.created_at)
    .limit(limit);

  let dispatched = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const result = await dispatchCustomKpiOutcomeEmailDelivery(delivery.id);
    dispatched += result.dispatched;
    failed += result.failed;
  }

  return {
    processed: deliveries.length,
    dispatched,
    failed,
  };
};
