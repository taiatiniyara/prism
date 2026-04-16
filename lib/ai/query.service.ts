import {
  enforceReadOnlyPrompt,
  enforceMaxRows,
  withTimeout,
  DEFAULT_AI_TIMEOUT_MS,
} from "./guardrails";
import { canExecuteService } from "./access-policy";
import { getAllowedReadService } from "./allowed-read-services";
import { resolveFilterContext } from "./context-resolution";
import { inferQueryClassFromPrompt, routeIntent } from "./intent-router";
import {
  getAggregationFailureAnalysis,
  getAggregationRunDetails,
  getAggregationRunSummary,
  getRenewableGenerationByUtilityYear,
} from "./read-services";
import { validateAiQueryResponse } from "./response-contract";
import { validateQueryClassContext } from "./query-class-map";
import { traceLogService } from "./trace-log.service";
import type {
  AiQueryInput,
  AiQueryResponse,
  AiUserRole,
  QueryFilterContext,
  QueryClass,
} from "./types";

interface RunAiQueryInput {
  input: AiQueryInput;
  userId: string;
  userRole: AiUserRole;
  userOrgId?: number | null;
}

export interface ModelSelectionOptions {
  degradedMode?: boolean;
  forceFallback?: boolean;
}

export const selectModelForExecution = (
  options?: ModelSelectionOptions,
): string => {
  const primary = process.env.AI_PRIMARY_MODEL ?? "gpt-5";
  const fallback = process.env.AI_FALLBACK_MODEL ?? "gpt-5-mini";

  if (options?.forceFallback || options?.degradedMode) {
    return fallback;
  }

  return primary;
};

export const resolveFollowUpBehavior = (
  prompt: string,
  sessionContextId?: string | null,
): { isClarification: boolean; message?: string } => {
  const looksLikeFollowUp =
    /\b(continue|follow up|same as above|again)\b/i.test(prompt);

  if (looksLikeFollowUp && !sessionContextId) {
    return {
      isClarification: true,
      message:
        "Please provide session context to continue this conversation, or ask a new query.",
    };
  }

  return { isClarification: false };
};

const buildRowsForQueryClass = (
  queryClass: QueryClass,
  reportPeriodId?: number,
  serviceAreaId?: number,
) => {
  const baseRow = {
    queryClass,
    reportPeriodId: reportPeriodId ?? null,
    serviceAreaId: serviceAreaId ?? null,
  };

  return [baseRow];
};

const resolveQueryClass = (input: AiQueryInput): QueryClass => {
  if (input.queryClass) {
    return input.queryClass;
  }

  const inferred = inferQueryClassFromPrompt(input.prompt);
  if (inferred === "AMBIGUOUS") {
    return "completeness";
  }

  return inferred;
};

const normalizeUtilityName = (value: string): string => {
  return value
    .trim()
    .replace(/^['"`]|['"`]$/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
};

const inferUtilityNameFromPrompt = (prompt: string): string | undefined => {
  const patterns = [
    /(?:generated|produce(?:d)?|generation)\s+by\s+(.+?)(?:\s+(?:in|during|for)\s+(?:fy\s*)?20\d{2}\b|[?.!,]|$)/i,
    /\bfor\s+(.+?)(?:\s+(?:in|during)\s+(?:fy\s*)?20\d{2}\b|[?.!,]|$)/i,
    /\bby\s+(.+?)(?:\s+(?:in|during)\s+(?:fy\s*)?20\d{2}\b|[?.!,]|$)/i,
  ] as const;

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const normalized = normalizeUtilityName(match[1]);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return undefined;
};

export const inferContextFromPrompt = (prompt: string): QueryFilterContext => {
  const inferred: QueryFilterContext = {};

  const runIdMatch = prompt.match(
    /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i,
  );
  if (runIdMatch?.[1]) {
    inferred.runId = runIdMatch[1];
  }

  const yearMatch = prompt.match(/(?:\bfy\s*|\b)(20\d{2})\b/i);
  if (yearMatch?.[1]) {
    inferred.year = Number(yearMatch[1]);
  }

  const reportPeriodMatch = prompt.match(/report\s*period(?:\s*id)?\s*(\d+)/i);
  if (reportPeriodMatch?.[1]) {
    inferred.reportPeriodId = Number(reportPeriodMatch[1]);
  }

  const serviceAreaMatch = prompt.match(/service\s*area(?:\s*id)?\s*(\d+)/i);
  if (serviceAreaMatch?.[1]) {
    inferred.serviceAreaId = Number(serviceAreaMatch[1]);
  }

  const utilityName = inferUtilityNameFromPrompt(prompt);
  if (utilityName) {
    inferred.utilityName = utilityName;
  }

  if (/energy\s*source/i.test(prompt)) {
    inferred.renewableDefinition = "energy-source";
  } else if (/energy\s*type/i.test(prompt)) {
    inferred.renewableDefinition = "energy-type";
  }

  return inferred;
};

const executeSpecializedRead = async (
  queryClass: QueryClass,
  context: QueryFilterContext,
  userRole: AiUserRole,
  userOrgId?: number | null,
): Promise<{
  summary: string;
  metrics: Array<{ label: string; value: string | number }>;
  rows: Record<string, unknown>[];
  warnings?: string[];
} | null> => {
  if (queryClass === "aggregation-run-summary") {
    return getAggregationRunSummary(context, { userRole, userOrgId });
  }

  if (queryClass === "aggregation-run-details") {
    return getAggregationRunDetails(context, { userRole, userOrgId });
  }

  if (queryClass === "aggregation-failure-analysis") {
    return getAggregationFailureAnalysis(context, { userRole, userOrgId });
  }

  if (queryClass === "generation-renewable-by-utility-year") {
    return getRenewableGenerationByUtilityYear(context, {
      userRole,
      userOrgId,
    });
  }

  return null;
};

export const runAiQuery = async ({
  input,
  userId,
  userRole,
  userOrgId,
}: RunAiQueryInput): Promise<AiQueryResponse> => {
  const requestId = crypto.randomUUID();

  if (!input.prompt?.trim()) {
    throw new Error("VALIDATION:prompt is required.");
  }

  const inferredPromptContext = inferContextFromPrompt(input.prompt);
  const { context, warnings: contextWarnings } = resolveFilterContext({
    requestContext: inferredPromptContext,
  });

  const queryClass = resolveQueryClass(input);
  validateQueryClassContext(queryClass, context);

  const followUpResolution = resolveFollowUpBehavior(
    input.prompt,
    input.sessionContextId,
  );

  try {
    enforceReadOnlyPrompt(input.prompt);

    const result = await withTimeout(
      Promise.resolve().then(async () => {
        const routed = routeIntent(queryClass);
        const allowedService = getAllowedReadService(routed.serviceKey);

        if (!canExecuteService(userRole, allowedService)) {
          throw new Error(
            "FORBIDDEN:You are not allowed to execute this query.",
          );
        }

        const specialized = await executeSpecializedRead(
          queryClass,
          context,
          userRole,
          userOrgId,
        );

        const rowData = enforceMaxRows(
          specialized?.rows ??
            buildRowsForQueryClass(
              queryClass,
              context.reportPeriodId,
              context.serviceAreaId,
            ),
        );

        const trace = await traceLogService.createTrace({
          requestId,
          selectedTools: [routed.serviceKey],
          latencyMs: 10,
          status: "SUCCESS",
          rowCountReturned: rowData.length,
        });

        const warnings = [...contextWarnings];
        if (followUpResolution.isClarification) {
          warnings.push(
            followUpResolution.message ?? "Missing follow-up context.",
          );
        }
        if (specialized?.warnings?.length) {
          warnings.push(...specialized.warnings);
        }

        const response: AiQueryResponse = {
          traceId: trace.traceId,
          summary:
            specialized?.summary ??
            `Generated ${routed.queryClass} summary for ${userRole}.`,
          metrics: [
            ...(specialized?.metrics ?? [
              {
                label: "Rows returned",
                value: rowData.length,
              },
            ]),
            {
              label: "Model",
              value: selectModelForExecution(),
            },
          ],
          rows: rowData,
          attribution: [
            {
              sourceName: routed.serviceKey,
              sourceType: "SERVICE_FUNCTION",
              sourceRef:
                specialized == null
                  ? "lib/ai/allowed-read-services.ts"
                  : "lib/ai/read-services.ts",
            },
          ],
          export: {
            pdfAvailable: true,
            csvAvailable: true,
            reportId: trace.traceId,
          },
          warnings: warnings.length ? warnings : undefined,
        };

        if (!validateAiQueryResponse(response)) {
          throw new Error(
            "DOWNSTREAM_FAILURE:Generated response did not match contract.",
          );
        }

        return response;
      }),
      DEFAULT_AI_TIMEOUT_MS,
    );

    void userId;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isPolicyBypass =
      message.includes("POLICY_BYPASS") ||
      message.toLowerCase().includes("policy");
    const isForbidden = message.startsWith("FORBIDDEN:");
    const isValidation = message.startsWith("VALIDATION:");
    const isNoData = message.startsWith("NO_DATA:");

    const failureType = isPolicyBypass
      ? "POLICY_BYPASS"
      : isNoData
        ? "NO_DATA"
        : isValidation
          ? "VALIDATION_ERROR"
          : isForbidden
            ? "FORBIDDEN"
            : "DOWNSTREAM_FAILURE";

    await traceLogService.createTrace({
      requestId,
      selectedTools: [],
      latencyMs: 0,
      status: [
        "POLICY_BYPASS",
        "NO_DATA",
        "VALIDATION_ERROR",
        "FORBIDDEN",
      ].includes(failureType)
        ? (failureType as
            | "POLICY_BYPASS"
            | "NO_DATA"
            | "VALIDATION_ERROR"
            | "FORBIDDEN")
        : "PARTIAL_FAILURE",
      failureType,
      rowCountReturned: 0,
    });

    throw error;
  }
};
