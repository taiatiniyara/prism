import type { CurrentUser } from "@/lib/user.service";
import type {
  ChatMessageInput,
  ChatbotCapabilityName,
  ChatbotRecommendedView,
} from "./types";
import {
  CAPABILITY_PATTERNS,
  createCapabilityContext,
  resolveRecommendedView,
  type CapabilityContext,
  type CapabilityResolution,
} from "./capabilities/common";
import {
  buildPerformanceSnapshotContext,
  buildReviewKpiDiagnosticsContext,
  buildScorecardSnapshotContext,
} from "./capabilities/performance";
import {
  buildAnomalyInsightsContext,
  buildBenchmarkingSnapshotContext,
  buildConfigurationSetupSnapshotContext,
  buildGovernanceAuditSnapshotContext,
  buildReportPeriodOverviewContext,
  buildTrendSnapshotContext,
  buildVisualPresentationHintsContext,
} from "./capabilities/reporting";
import {
  buildCategoryCompletenessContext,
  buildServiceAreaCompletenessContext,
} from "./capabilities/breakdowns";
import {
  buildAggregationLevelCompletenessContext,
  buildCustomerTypeCompletenessContext,
  buildEnergyProviderCompletenessContext,
  buildEnergyResourceCompletenessContext,
  buildEnergySourceCompletenessContext,
  buildEnergyTypeCompletenessContext,
  buildPaymentModeCompletenessContext,
  buildSubcategoryCompletenessContext,
} from "./capabilities/dimensions";
import { buildCustomKpiPipelineContext } from "./capabilities/customKpiPipeline";
import { buildInputValueLookupContext } from "./capabilities/valueLookup";
import { emitCapabilityTelemetry } from "./telemetry";

// Builder registry keeps capability routing explicit and easy to extend.
const capabilityBuilders: Record<
  Exclude<ChatbotCapabilityName, "visual-presentation-hints">,
  (ctx: CapabilityContext) => Promise<CapabilityResolution>
> = {
  "report-period-overview": buildReportPeriodOverviewContext,
  "anomaly-insights": buildAnomalyInsightsContext,
  "performance-snapshot": buildPerformanceSnapshotContext,
  "scorecard-snapshot": buildScorecardSnapshotContext,
  "review-kpi-diagnostics": buildReviewKpiDiagnosticsContext,
  "benchmarking-snapshot": buildBenchmarkingSnapshotContext,
  "trend-snapshot": buildTrendSnapshotContext,
  "governance-audit-snapshot": buildGovernanceAuditSnapshotContext,
  "configuration-setup-snapshot": buildConfigurationSetupSnapshotContext,
  "category-completeness-snapshot": buildCategoryCompletenessContext,
  "subcategory-completeness-snapshot": buildSubcategoryCompletenessContext,
  "service-area-completeness-snapshot": buildServiceAreaCompletenessContext,
  "energy-source-completeness-snapshot": buildEnergySourceCompletenessContext,
  "energy-provider-completeness-snapshot":
    buildEnergyProviderCompletenessContext,
  "energy-type-completeness-snapshot": buildEnergyTypeCompletenessContext,
  "energy-resource-completeness-snapshot":
    buildEnergyResourceCompletenessContext,
  "aggregation-level-completeness-snapshot":
    buildAggregationLevelCompletenessContext,
  "customer-type-completeness-snapshot": buildCustomerTypeCompletenessContext,
  "payment-mode-completeness-snapshot": buildPaymentModeCompletenessContext,
  "custom-kpi-pipeline-snapshot": buildCustomKpiPipelineContext,
  "input-value-lookup": buildInputValueLookupContext,
};

const isReferentialVisualFollowUp = (latestUserMessage: string): boolean => {
  const normalized = latestUserMessage.toLowerCase();

  const referencesPriorData =
    /\b(this|that|same|above|previous|prior|shared)\b/.test(normalized) &&
    /\b(data|dataset|result|results|table|chart|visual|snapshot)\b/.test(
      normalized,
    );

  const asksForVisual =
    /\b(show|render|plot|visuali[sz]e|display|give|create)\b/.test(
      normalized,
    ) && /\b(chart|graph|table|visual|dashboard|plot)\b/.test(normalized);

  return referencesPriorData || asksForVisual;
};

export const resolveChatbotCapabilities = async (
  user: CurrentUser,
  messages: ChatMessageInput[],
): Promise<{
  additionalSystemContext: string;
  capabilitiesUsed: ChatbotCapabilityName[];
  recommendedView: ChatbotRecommendedView;
}> => {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;

  if (!latestUserMessage) {
    return {
      additionalSystemContext: "",
      capabilitiesUsed: [],
      recommendedView: "text",
    };
  }

  const requestedCapabilities = CAPABILITY_PATTERNS.filter((item) =>
    item.pattern.test(latestUserMessage),
  ).map((item) => item.capability);

  const uniqueRequestedCapabilities = [...new Set(requestedCapabilities)];
  const isVisualOnlyRequest =
    uniqueRequestedCapabilities.length === 1 &&
    uniqueRequestedCapabilities[0] === "visual-presentation-hints";

  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content);

  const recentScopeDetectionText = userMessages.slice(-3).join("\n");

  const normalizedRequestedCapabilities =
    isVisualOnlyRequest && isReferentialVisualFollowUp(latestUserMessage)
      ? ["report-period-overview", ...uniqueRequestedCapabilities]
      : uniqueRequestedCapabilities;

  // When no pattern matches, fall back to the broadest grounding capability so
  // the LLM has at least the report-period overview to anchor an answer instead
  // of free-styling. This keeps the unmatched-question path observable via
  // the telemetry `fallbackUsed` flag.
  const fallbackUsed = normalizedRequestedCapabilities.length === 0;
  const effectiveCapabilities: ChatbotCapabilityName[] = fallbackUsed
    ? ["report-period-overview"]
    : (normalizedRequestedCapabilities as ChatbotCapabilityName[]);

  const maxCapabilities = Number(process.env.CHATBOT_MAX_CAPABILITIES ?? "2");
  const normalizedMaxCapabilities =
    Number.isFinite(maxCapabilities) && maxCapabilities > 0
      ? Math.floor(maxCapabilities)
      : 2;

  // Preserve regex declaration order as capability priority and cap fan-out for latency.
  const prioritizedCapabilities = [...new Set(effectiveCapabilities)].slice(
    0,
    normalizedMaxCapabilities,
  );

  const needsDataContext = prioritizedCapabilities.some(
    (capability) => capability !== "visual-presentation-hints",
  );

  // Only hydrate shared DB-backed context when at least one capability actually needs it.
  const ctx = needsDataContext
    ? await createCapabilityContext(
        user,
        latestUserMessage,
        recentScopeDetectionText,
      )
    : null;

  const startedAt = Date.now();
  const perCapabilityMs: Record<string, number> = {};

  const resolutionTasks = prioritizedCapabilities.map(async (capability) => {
    const builderStartedAt = Date.now();
    try {
      if (capability === "visual-presentation-hints") {
        return await buildVisualPresentationHintsContext(latestUserMessage);
      }

      if (!ctx) {
        throw new Error("VALIDATION:Missing capability context.");
      }

      const builder = capabilityBuilders[capability];
      return await builder(ctx);
    } catch (error) {
      // A single failing builder must not abort the whole chatbot response.
      // Surface a degraded grounding block so the LLM still has scope context.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[chatbot] capability '${capability}' failed:`, message);
      return {
        capability,
        contextBlock: `PRISM data grounding (${capability}): capability failed to resolve (${message}). Tell the user the requested data could not be retrieved and suggest rephrasing or trying a narrower scope.`,
      } satisfies CapabilityResolution;
    } finally {
      perCapabilityMs[capability] = Date.now() - builderStartedAt;
    }
  });

  const resolutions: CapabilityResolution[] =
    await Promise.all(resolutionTasks);

  const scopeContext = ctx
    ? [
        "PRISM scope grounding:",
        `- Default utility for this user/session: ${ctx.defaultUtility ?? "unknown"}`,
        `- Single-utility scope: ${ctx.isSingleUtilityScope ? "yes" : "no"}`,
        `- User explicitly requested all-utilities view: ${ctx.allUtilitiesRequested ? "yes" : "no"}`,
        "- If the user says 'my utility' or asks utility-specific follow-up without naming one, assume the default utility above.",
      ].join("\n")
    : "";

  const contextParts = [
    scopeContext,
    ...resolutions.map((resolution) => resolution.contextBlock),
  ].filter((value) => value.trim().length > 0);

  const recommendedView = resolveRecommendedView(latestUserMessage);
  const capabilitiesUsed = resolutions.map(
    (resolution) => resolution.capability,
  );

  emitCapabilityTelemetry({
    matched: uniqueRequestedCapabilities,
    used: capabilitiesUsed,
    fallbackUsed,
    totalMs: Date.now() - startedAt,
    perCapabilityMs,
    recommendedView,
    messageLength: latestUserMessage.length,
  });

  return {
    additionalSystemContext: contextParts.join("\n\n"),
    capabilitiesUsed,
    recommendedView,
  };
};
