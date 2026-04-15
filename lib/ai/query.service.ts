import {
  enforceReadOnlyPrompt,
  enforceMaxRows,
  withTimeout,
  DEFAULT_AI_TIMEOUT_MS,
} from "./guardrails";
import { resolveFilterContext } from "./context-resolution";
import { routeIntent } from "./intent-router";
import { validateAiQueryResponse } from "./response-contract";
import { validateQueryClassContext } from "./query-class-map";
import { traceLogService } from "./trace-log.service";
import type {
  AiQueryInput,
  AiQueryResponse,
  AiUserRole,
  QueryClass,
} from "./types";

interface RunAiQueryInput {
  input: AiQueryInput;
  userId: string;
  userRole: AiUserRole;
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

export const runAiQuery = async ({
  input,
  userId,
  userRole,
}: RunAiQueryInput): Promise<AiQueryResponse> => {
  const requestId = crypto.randomUUID();

  if (!input.prompt?.trim()) {
    throw new Error("VALIDATION:prompt is required.");
  }

  const { context, warnings: contextWarnings } = resolveFilterContext({
    requestContext: input.filterContext,
  });

  validateQueryClassContext(input.queryClass, context);

  const followUpResolution = resolveFollowUpBehavior(
    input.prompt,
    input.sessionContextId,
  );

  try {
    enforceReadOnlyPrompt(input.prompt);

    const result = await withTimeout(
      Promise.resolve().then(async () => {
        const routed = routeIntent(input.queryClass);
        const rowData = enforceMaxRows(
          buildRowsForQueryClass(
            input.queryClass,
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

        const response: AiQueryResponse = {
          traceId: trace.traceId,
          summary: `Generated ${routed.queryClass} summary for ${userRole}.`,
          metrics: [
            {
              label: "Rows returned",
              value: rowData.length,
            },
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
              sourceRef: "lib/ai/allowed-read-services.ts",
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
    const failureType =
      error instanceof Error &&
      (error.message.includes("POLICY_BYPASS") ||
        error.message.toLowerCase().includes("policy"))
        ? "POLICY_BYPASS"
        : "DOWNSTREAM_FAILURE";

    await traceLogService.createTrace({
      requestId,
      selectedTools: [],
      latencyMs: 0,
      status:
        failureType === "POLICY_BYPASS" ? "POLICY_BYPASS" : "PARTIAL_FAILURE",
      failureType,
      rowCountReturned: 0,
    });

    throw error;
  }
};
