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
  buildBenchmarkingSnapshotContext,
  buildConfigurationSetupSnapshotContext,
  buildGovernanceAuditSnapshotContext,
  buildReportPeriodOverviewContext,
  buildTrendSnapshotContext,
  buildVisualPresentationHintsContext,
} from "./capabilities/reporting";

// Builder registry keeps capability routing explicit and easy to extend.
const capabilityBuilders: Record<
  Exclude<ChatbotCapabilityName, "visual-presentation-hints">,
  (ctx: CapabilityContext) => Promise<CapabilityResolution>
> = {
  "report-period-overview": buildReportPeriodOverviewContext,
  "performance-snapshot": buildPerformanceSnapshotContext,
  "scorecard-snapshot": buildScorecardSnapshotContext,
  "review-kpi-diagnostics": buildReviewKpiDiagnosticsContext,
  "benchmarking-snapshot": buildBenchmarkingSnapshotContext,
  "trend-snapshot": buildTrendSnapshotContext,
  "governance-audit-snapshot": buildGovernanceAuditSnapshotContext,
  "configuration-setup-snapshot": buildConfigurationSetupSnapshotContext,
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

  if (!requestedCapabilities.length) {
    return {
      additionalSystemContext: "",
      capabilitiesUsed: [],
      recommendedView: "text",
    };
  }

  const maxCapabilities = Number(process.env.CHATBOT_MAX_CAPABILITIES ?? "2");
  const normalizedMaxCapabilities =
    Number.isFinite(maxCapabilities) && maxCapabilities > 0
      ? Math.floor(maxCapabilities)
      : 2;

  // Preserve regex declaration order as capability priority and cap fan-out for latency.
  const prioritizedCapabilities = [...new Set(requestedCapabilities)].slice(
    0,
    normalizedMaxCapabilities,
  );

  const needsDataContext = prioritizedCapabilities.some(
    (capability) => capability !== "visual-presentation-hints",
  );

  // Only hydrate shared DB-backed context when at least one capability actually needs it.
  const ctx = needsDataContext
    ? await createCapabilityContext(user, latestUserMessage)
    : null;

  const resolutionTasks = prioritizedCapabilities.map(async (capability) => {
    if (capability === "visual-presentation-hints") {
      return buildVisualPresentationHintsContext(latestUserMessage);
    }

    if (!ctx) {
      throw new Error("VALIDATION:Missing capability context.");
    }

    const builder = capabilityBuilders[capability];
    return builder(ctx);
  });

  const resolutions: CapabilityResolution[] = await Promise.all(resolutionTasks);

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

  return {
    additionalSystemContext: contextParts.join("\n\n"),
    capabilitiesUsed: resolutions.map((resolution) => resolution.capability),
    recommendedView: resolveRecommendedView(latestUserMessage),
  };
};
