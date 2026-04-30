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
    capability: "input-value-lookup",
    pattern:
      /\b(?:what(?:'s| is| are| was| were)|how much|how many|give me the|tell me the|show (?:me )?(?:the )?(?:value|amount|total|number)|sum|average|avg|mean|min|minimum|max|maximum|peak|highest|lowest|difference|diff|change|delta|variance|increase|decrease|grew|fell|growth|year[- ]over[- ]year|yoy|compared to|versus|vs\.?)\b[\s\S]{0,140}?\b(?:value|amount|total|installed capacity|capacity|generation|generated|sold|sales|losses|loss|revenue|profit|tariff|customers?|employees?|hours|interruptions?|downtime|households?|population|consumption|kwh|mwh|gwh|inflation|gdp|fuel|cost|expense|injuries|access to electricity|fte|saidi|saifi|exchange rate|peak load|average load|station auxili?ary|non[- ]revenue energy)\b|\binstalled capacity\b|\belectricity (?:generated|sold|demand|purchased|consumed)\b|\bnon[- ]revenue energy\b|\btariff (?:block|fixed|vat|gst|rate)\b|\bo&m costs?\b|\bstaff costs?\b|\bsaidi\b|\bsaifi\b|\bservice:\s*\w+|\bapportioned cost\b|\bfte employees?\b|\b(?:executive|technical|administrative|finance|hr|ict|procurement|marketing) employees\b|\b(?:is|are|does|has|have|was|were)\b[\s\S]{0,80}?\b(?:annual report|strategic plan|code of conduct|commercial mandate|performance contract|ministers?|board|audited|adopted|implemented|in place)\b|\b(?:accounting standards|electricity regulation|feeder type|power quality|fuel pricing regulation|fuel supply access|utility ownership|ownership type|land area|islands|rural population|urban population|inflation rate|unemployment rate|air connectivity|household size)\b|\busd exchange rate\b|\binjur(?:y|ies)\b/i,
  },
  {
    capability: "category-completeness-snapshot",
    pattern:
      /\binput categor(?:y|ies)\b|by (?:input )?categor(?:y|ies)|categor(?:y|ies) breakdown|breakdown[\s\S]{0,40}?categor(?:y|ies)|each[\s\S]{0,30}?categor(?:y|ies)|per (?:input )?categor(?:y|ies)|across (?:input )?categor(?:y|ies)|completeness (?:by|per|across) (?:input )?categor(?:y|ies)|category complet|list .*categor(?:y|ies)/i,
  },
  {
    capability: "subcategory-completeness-snapshot",
    pattern:
      /\bsubcategor(?:y|ies)\b|by sub[- ]?categor(?:y|ies)|sub[- ]?categor(?:y|ies) breakdown|breakdown[\s\S]{0,40}?sub[- ]?categor(?:y|ies)|each[\s\S]{0,30}?sub[- ]?categor(?:y|ies)|per sub[- ]?categor(?:y|ies)|across sub[- ]?categor(?:y|ies)|completeness (?:by|per|across) sub[- ]?categor(?:y|ies)/i,
  },
  {
    capability: "service-area-completeness-snapshot",
    pattern:
      /by service[- ]area|service[- ]area complet|across service[- ]areas|service[- ]area breakdown|per service[- ]area|completeness (?:by|per|across) service[- ]area|breakdown[\s\S]{0,40}?service[- ]area|each[\s\S]{0,30}?service[- ]area/i,
  },
  {
    capability: "energy-source-completeness-snapshot",
    pattern:
      /\benergy[- ]sources?\b|by energy[- ]source|energy[- ]source breakdown|per energy[- ]source|across energy[- ]sources?|breakdown[\s\S]{0,40}?energy[- ]source|each[\s\S]{0,30}?energy[- ]source|completeness (?:by|per|across) energy[- ]source/i,
  },
  {
    capability: "energy-provider-completeness-snapshot",
    pattern:
      /\benergy[- ]providers?\b|by energy[- ]provider|energy[- ]provider breakdown|per energy[- ]provider|across energy[- ]providers?|breakdown[\s\S]{0,40}?energy[- ]provider|each[\s\S]{0,30}?energy[- ]provider|completeness (?:by|per|across) energy[- ]provider/i,
  },
  {
    capability: "energy-type-completeness-snapshot",
    pattern:
      /\benergy[- ]types?\b|by energy[- ]type|energy[- ]type breakdown|per energy[- ]type|across energy[- ]types?|breakdown[\s\S]{0,40}?energy[- ]type|each[\s\S]{0,30}?energy[- ]type|completeness (?:by|per|across) energy[- ]type/i,
  },
  {
    capability: "energy-resource-completeness-snapshot",
    pattern:
      /\benergy[- ]resources?\b|by energy[- ]resource|energy[- ]resource breakdown|per energy[- ]resource|across energy[- ]resources?|breakdown[\s\S]{0,40}?energy[- ]resource|each[\s\S]{0,30}?energy[- ]resource|completeness (?:by|per|across) energy[- ]resource|by power station|per power station/i,
  },
  {
    capability: "aggregation-level-completeness-snapshot",
    pattern:
      /\baggregation[- ]levels?\b|\bagg(?:regation)?[- ]levels?\b|by aggregation[- ]level|aggregation[- ]level breakdown|per aggregation[- ]level|across aggregation[- ]levels?|breakdown[\s\S]{0,40}?aggregation[- ]level|each[\s\S]{0,30}?aggregation[- ]level|completeness (?:by|per|across) aggregation[- ]level/i,
  },
  {
    capability: "customer-type-completeness-snapshot",
    pattern:
      /\bcustomer[- ]types?\b|by customer[- ]type|customer[- ]type breakdown|per customer[- ]type|across customer[- ]types?|breakdown[\s\S]{0,40}?customer[- ]type|each[\s\S]{0,30}?customer[- ]type|completeness (?:by|per|across) customer[- ]type|by customer segment|per customer segment/i,
  },
  {
    capability: "payment-mode-completeness-snapshot",
    pattern:
      /\bpayment[- ]modes?\b|by payment[- ]mode|payment[- ]mode breakdown|per payment[- ]mode|across payment[- ]modes?|breakdown[\s\S]{0,40}?payment[- ]mode|each[\s\S]{0,30}?payment[- ]mode|completeness (?:by|per|across) payment[- ]mode|prepaid vs postpaid|prepaid versus postpaid/i,
  },
  {
    capability: "custom-kpi-pipeline-snapshot",
    pattern:
      /custom kpi pipeline|custom kpi (?:requests?|approval|workflow|velocity|pending|pipeline|queue|backlog|status)|pending custom kpi|custom kpi review|custom kpi (?:counts?|metric)/i,
  },
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

const normalizeScopeQuery = (latestUserMessage: string): string => {
  return latestUserMessage
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const requestsAllUtilities = (latestUserMessage: string): boolean => {
  const normalized = normalizeScopeQuery(latestUserMessage);

  if (
    /(all\s+utilit(?:y|ies|ie?s)|across\s+all\s+utilit(?:y|ies|ie?s)|platform\s+snapshot|system\s*wide|global\s+snapshot|overall\s+platform|other\s+utilit(?:y|ies|ie?s)|peer\s+utilit(?:y|ies|ie?s)|cross\s*utility|compare\s+.*utilit(?:y|ies|ie?s)|benchmark\s+against\s+.*utilit(?:y|ies|ie?s)|(?:how many|number of|count of|total)\s+utilit(?:y|ies|ie?s))/i.test(
      normalized,
    )
  ) {
    return true;
  }

  // If user asks about utilities in plural with status/progress wording,
  // treat it as a multi-utility request unless they explicitly scope to "my/our" utility.
  return (
    /(utilities|utilites|utilitys)/i.test(normalized) &&
    /(progress|status|submitted|submission|reported|entered|approved|reviewed|endorsed|pending|complete|completion|data\s+entry)/i.test(
      normalized,
    ) &&
    !/(my\s+utility|our\s+utility|this\s+utility)/i.test(normalized)
  );
};

export const createCapabilityContext = async (
  user: CurrentUser,
  latestUserMessage: string,
  scopeDetectionText?: string,
): Promise<CapabilityContext> => {
  const allUtilitiesRequested = requestsAllUtilities(
    scopeDetectionText ?? latestUserMessage,
  );
  const periods = await GetReportPeriods(user, {
    forceAllUtilities: allUtilitiesRequested,
  });
  const defaultUtility = resolveDefaultUtility(periods);
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
