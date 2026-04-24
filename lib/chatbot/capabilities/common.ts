import { GetReportPeriods } from "@/app/data-entry/service";
import type { CurrentUser } from "@/lib/user.service";
import type { ChatbotCapabilityName, ChatbotRecommendedView } from "../types";

export interface CapabilityResolution {
  capability: ChatbotCapabilityName;
  contextBlock: string;
}

export interface CapabilityContext {
  user: CurrentUser;
  latestUserMessage: string;
  periods: Awaited<ReturnType<typeof GetReportPeriods>>;
  scopedPeriods: Awaited<ReturnType<typeof GetReportPeriods>>;
  selectedPeriod: Awaited<ReturnType<typeof GetReportPeriods>>[number] | null;
  defaultUtility: string | null;
  isSingleUtilityScope: boolean;
  allUtilitiesRequested: boolean;
}

export const DEFAULT_REVIEW_KPI_CONTEXT = {
  reportTypeId: null,
  reportPeriodId: null,
  kpiCategoryId: null,
  kpiSubcategoryId: null,
  serviceAreaId: null,
};

export const CAPABILITY_PATTERNS: Array<{
  capability: ChatbotCapabilityName;
  pattern: RegExp;
}> = [
  {
    capability: "report-period-overview",
    pattern:
      /report period|multiple report periods|across report periods|completeness|complete|incomplete|pending|approved|reviewed|endorsed|not available|submission|data entry|status|general kpi values|kpi values/i,
  },
  {
    capability: "anomaly-insights",
    pattern:
      /anomal|outlier|spike|drop|sudden|unexpected|what changed|change digest|exception|alert|watchlist/i,
  },
  {
    capability: "performance-snapshot",
    pattern:
      /performance|weakest|strongest|off track|at risk|decline|improv|prioriti[sz]e|action plan|underperform/i,
  },
  {
    capability: "scorecard-snapshot",
    pattern:
      /scorecard|perspective|objective|initiative|excluded|missing_target|missing_actual|invalid_range|not_approved|duplicate_superseded/i,
  },
  {
    capability: "review-kpi-diagnostics",
    pattern:
      /why|stale|missing input|error|failed|formula|root cause|diagnostic|comment|unresolved|blocked/i,
  },
  {
    capability: "benchmarking-snapshot",
    pattern:
      /benchmark|compare|peer|rank|leaderboard|median|top|bottom|outlier|utilities|countries|subregions/i,
  },
  {
    capability: "trend-snapshot",
    pattern:
      /trend|over time|year on year|month on month|quarter|changed|improved|worsened|trajectory/i,
  },
  {
    capability: "governance-audit-snapshot",
    pattern:
      /governance|audit|updated by|who updated|ownership|approval|compliance|trace|evidence|confidence|quality/i,
  },
  {
    capability: "configuration-setup-snapshot",
    pattern:
      /how to|setup|configure|service area|report type|reporting settings|filters|kpi category|kpi subcategory|roles|permissions/i,
  },
  {
    capability: "visual-presentation-hints",
    pattern:
      /show.*(table|chart|graph|dashboard|leaderboard|sankey|heatmap|radar|scatter)|visual|bar chart|line chart|heatmap|sankey|radar|scatter|presentation/i,
  },
];

export const toPercent = (value: number, total: number): string => {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
};

export const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

export const scoreStatusSeverity = (status: string | null): number => {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized.includes("off")) {
    return 3;
  }

  if (normalized.includes("risk")) {
    return 2;
  }

  if (normalized.includes("track") || normalized.includes("good")) {
    return 1;
  }

  return 0;
};

export const resolveRecommendedView = (
  latestUserMessage: string,
): ChatbotRecommendedView => {
  const msg = latestUserMessage.toLowerCase();

  if (
    /compare|benchmark|peer utilit(?:y|ies)|other utilit(?:y|ies)|across utilit(?:y|ies)/i.test(
      msg,
    )
  ) {
    return "table";
  }

  if (msg.includes("sankey")) {
    return "sankey";
  }

  if (msg.includes("heatmap") || msg.includes("heat map")) {
    return "heatmap";
  }

  if (msg.includes("radar")) {
    return "radar";
  }

  if (msg.includes("scatter") || msg.includes("scatter plot")) {
    return "scatter";
  }

  if (msg.includes("leaderboard") || msg.includes("rank")) {
    return "leaderboard";
  }

  if (msg.includes("dashboard")) {
    return "dashboard";
  }

  if (msg.includes("line chart") || msg.includes("trend")) {
    return "line-chart";
  }

  if (
    msg.includes("bar chart") ||
    msg.includes("chart") ||
    msg.includes("graph")
  ) {
    return "bar-chart";
  }

  if (msg.includes("table")) {
    return "table";
  }

  return "text";
};

const resolveSelectedPeriod = (
  latestUserMessage: string,
  periods: Awaited<ReturnType<typeof GetReportPeriods>>,
): Awaited<ReturnType<typeof GetReportPeriods>>[number] | null => {
  if (!periods.length) {
    return null;
  }

  const yearMatch = latestUserMessage.match(/\b(20\d{2})\b/);
  if (!yearMatch) {
    return periods[0];
  }

  const year = yearMatch[1];
  const byYear = periods.find((period) => period.Period.includes(year));
  return byYear ?? periods[0];
};

const resolveDefaultUtility = (
  periods: Awaited<ReturnType<typeof GetReportPeriods>>,
): string | null => {
  const utilityCounts = new Map<string, number>();

  for (const period of periods) {
    const utility = period.Utility?.trim();
    if (!utility) {
      continue;
    }

    utilityCounts.set(utility, (utilityCounts.get(utility) ?? 0) + 1);
  }

  if (utilityCounts.size === 0) {
    return null;
  }

  if (utilityCounts.size === 1) {
    return [...utilityCounts.keys()][0];
  }

  return [...utilityCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

const requestsAllUtilities = (latestUserMessage: string): boolean => {
  return /(all utilities|across utilities|platform snapshot|system[- ]?wide|global snapshot|overall platform|other utilities|peer utilit(?:y|ies)|cross[- ]utility|compare .*utilit(?:y|ies)|benchmark against .*utilit(?:y|ies)|(?:how many|number of|count of|total)\s+utilit(?:y|ies)|utilit(?:y|ies).*\b(submitted|submission|reported|entered|approved|reviewed|endorsed)\b)/i.test(
    latestUserMessage,
  );
};

export const createCapabilityContext = async (
  user: CurrentUser,
  latestUserMessage: string,
): Promise<CapabilityContext> => {
  const periods = await GetReportPeriods(user);
  const defaultUtility = resolveDefaultUtility(periods);
  const allUtilitiesRequested = requestsAllUtilities(latestUserMessage);
  const scopedPeriods =
    defaultUtility && !allUtilitiesRequested
      ? periods.filter((period) => period.Utility === defaultUtility)
      : periods;

  const selectedPeriod =
    resolveSelectedPeriod(latestUserMessage, scopedPeriods) ??
    resolveSelectedPeriod(latestUserMessage, periods);

  return {
    user,
    latestUserMessage,
    periods,
    scopedPeriods,
    selectedPeriod,
    defaultUtility,
    isSingleUtilityScope:
      defaultUtility != null &&
      new Set(periods.map((period) => period.Utility).filter(Boolean)).size ===
        1,
    allUtilitiesRequested,
  };
};
