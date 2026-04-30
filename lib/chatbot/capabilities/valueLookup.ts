/**
 * Resolves direct value-lookup questions like
 *   "What is the total installed capacity of solar in 2024?"
 *   "How many residential customers do we have?"
 *   "Show me Service: Revenue for last year."
 *
 * Strategy:
 *   1. Tokenise the latest user message (drop stopwords + dimension labels).
 *   2. Find candidate input/KPI definitions whose `name` or `variable_name`
 *      ILIKEs any of the tokens. Score each candidate by how many tokens
 *      appear in its `name`. Keep top ~3.
 *   3. Detect dimension labels in the message that map to managed-list items
 *      (Energy Source, Energy Provider, Energy Type, Customer Type,
 *      Payment Mode) and use them to filter `data_entries`.
 *   4. Pull entered/reviewed/approved/endorsed rows for those candidates
 *      from `data_entries`, scoped to the user's report periods (which are
 *      already utility-filtered upstream).
 *   5. Render a compact grounding block. We never invent values; if no
 *      candidate or no rows match we say so.
 */
import { and, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/connection";
import { inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";

import { type CapabilityContext, type CapabilityResolution } from "./common";

const STATUS_LABELS: Record<number, string> = {
  1: "Requested",
  2: "Pending",
  3: "Entered",
  4: "Reviewed",
  5: "Approved",
  6: "Endorsed",
  7: "Not_Available",
};

const COMPLETION_STATUS_IDS = [3, 4, 5, 6];
const MAX_CANDIDATE_DEFS = 3;
const MAX_RESULT_ROWS = 200;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "in",
  "on",
  "by",
  "to",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "and",
  "or",
  "but",
  "if",
  "as",
  "at",
  "with",
  "from",
  "into",
  "over",
  "under",
  "between",
  "across",
  "what",
  "whats",
  "how",
  "much",
  "many",
  "show",
  "tell",
  "give",
  "list",
  "me",
  "us",
  "my",
  "our",
  "your",
  "their",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "please",
  "value",
  "values",
  "amount",
  "amounts",
  "total",
  "totals",
  "number",
  "numbers",
  "count",
  "counts",
  "sum",
  "average",
  "avg",
  "report",
  "reports",
  "period",
  "periods",
  "year",
  "years",
  "ytd",
  "fy",
  "quarter",
  "monthly",
  "annual",
  "annually",
  "utility",
  "utilities",
  "company",
  "companies",
  "organisation",
  "organization",
  "data",
  "metric",
  "metrics",
  "kpi",
  "kpis",
  "input",
  "inputs",
  "definition",
  "definitions",
  "all",
  "each",
  "per",
  "any",
  "some",
  "every",
  // dimension category words (we resolve dimension membership separately)
  "energy",
  "source",
  "sources",
  "provider",
  "providers",
  "type",
  "types",
  "customer",
  "customers",
  "segment",
  "segments",
  "payment",
  "mode",
  "modes",
  "service",
  "area",
  "areas",
  "resource",
  "resources",
  "category",
  "categories",
  "subcategory",
  "subcategories",
  "level",
  "levels",
  "aggregation",
]);

const tokenize = (msg: string): string[] => {
  const raw = msg.toLowerCase().match(/[a-z][a-z0-9_'-]*/g) ?? [];
  return [...new Set(raw.filter((w) => w.length >= 3 && !STOPWORDS.has(w)))];
};

type AggregationOp =
  | "sum"
  | "average"
  | "min"
  | "max"
  | "count"
  | "difference"
  | "percent_change";

interface AggregationIntent {
  ops: AggregationOp[];
  yearA: string | null;
  yearB: string | null;
}

const AGG_PATTERNS: Array<{ op: AggregationOp; pattern: RegExp }> = [
  {
    op: "sum",
    pattern: /\b(?:sum|total|combined|aggregate|add up|altogether)\b/i,
  },
  { op: "average", pattern: /\b(?:average|avg|mean|typical)\b/i },
  { op: "min", pattern: /\b(?:min|minimum|lowest|smallest|least)\b/i },
  { op: "max", pattern: /\b(?:max|maximum|highest|largest|peak|most)\b/i },
  {
    op: "count",
    pattern:
      /\b(?:count|how many entries|number of entries|how many rows|number of records)\b/i,
  },
  {
    op: "difference",
    pattern:
      /\b(?:difference|diff|change|delta|variance|increase|decrease|gap|compared to|versus|vs\.?|year[- ]over[- ]year|yoy)\b/i,
  },
  {
    op: "percent_change",
    pattern:
      /\b(?:percent(?:age)? (?:change|growth|increase|decrease)|growth rate|% change|pct change|grew by|fell by)\b/i,
  },
];

const detectAggregationIntent = (message: string): AggregationIntent => {
  const ops: AggregationOp[] = [];
  for (const { op, pattern } of AGG_PATTERNS) {
    if (pattern.test(message)) ops.push(op);
  }
  // percent_change implies difference
  if (ops.includes("percent_change") && !ops.includes("difference")) {
    ops.push("difference");
  }
  const years = [...new Set(message.match(/\b(20\d{2})\b/g) ?? [])];
  const [yearA = null, yearB = null] = years;
  return { ops, yearA, yearB };
};

const resolveScopePeriodIds = (ctx: CapabilityContext): number[] => {
  const ids = new Set<number>();
  const yearMatches = [
    ...new Set(ctx.latestUserMessage.match(/\b(20\d{2})\b/g) ?? []),
  ];
  if (yearMatches.length > 0) {
    for (const year of yearMatches) {
      for (const period of ctx.scopedPeriods) {
        if (period.Period.includes(year)) ids.add(period.Id);
      }
    }
  }
  if (ids.size === 0 && ctx.selectedPeriod) {
    ids.add(ctx.selectedPeriod.Id);
  }
  if (ids.size === 0) {
    for (const period of ctx.scopedPeriods.slice(0, 6)) {
      ids.add(period.Id);
    }
  }
  return [...ids];
};

interface DimensionMatch {
  field:
    | "energy_source_id"
    | "energy_provider_id"
    | "customer_type_id"
    | "payment_mode_id";
  id: number;
  name: string;
}

const DIMENSION_LIST_NAMES: Record<DimensionMatch["field"], string> = {
  energy_source_id: "Energy Source",
  energy_provider_id: "Energy Provider",
  customer_type_id: "Customer Type",
  payment_mode_id: "Payment Mode",
};

const resolveDimensionMatches = async (
  message: string,
): Promise<DimensionMatch[]> => {
  const lower = ` ${message.toLowerCase()} `;
  const rows = await db
    .select({
      itemId: managedListItems.id,
      itemName: managedListItems.name,
      listName: managedLists.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        inArray(managedLists.name, [
          "Energy Source",
          "Energy Provider",
          "Customer Type",
          "Payment Mode",
        ]),
      ),
    );

  const matches: DimensionMatch[] = [];
  for (const row of rows) {
    const itemName = (row.itemName ?? "").toLowerCase().trim();
    if (!itemName || itemName.length < 3) continue;
    // skip catch-all "All ..." labels
    if (itemName.startsWith("all ") || itemName === "all") continue;
    if (!lower.includes(` ${itemName} `)) continue;
    const field = (Object.entries(DIMENSION_LIST_NAMES).find(
      ([, listName]) => listName === row.listName,
    )?.[0] ?? null) as DimensionMatch["field"] | null;
    if (!field) continue;
    matches.push({ field, id: row.itemId, name: row.itemName ?? "" });
  }
  return matches;
};

interface CandidateDefinition {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
  category: string | null;
  dataType: string | null;
  isKpi: boolean;
  matchScore: number;
}

const findCandidateDefinitions = async (
  tokens: string[],
): Promise<CandidateDefinition[]> => {
  if (tokens.length === 0) return [];

  const conditions: SQL[] = [];
  for (const token of tokens) {
    conditions.push(ilike(inputDefinitions.name, `%${token}%`));
    conditions.push(ilike(inputDefinitions.variable_name, `%${token}%`));
  }

  const rows = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variableName: inputDefinitions.variable_name,
      isKpi: inputDefinitions.is_kpi,
      unit: managedListItems.name,
      category: sql<string | null>`(
        select cat.name from managed_list_items cat
        where cat.id = ${inputDefinitions.category_id}
      )`,
      dataType: sql<string | null>`(
        select dt.name from managed_list_items dt
        where dt.id = ${inputDefinitions.data_type_id}
      )`,
    })
    .from(inputDefinitions)
    .leftJoin(
      managedListItems,
      eq(managedListItems.id, inputDefinitions.unit_id),
    )
    .where(and(eq(inputDefinitions.is_active, true), or(...conditions)));

  const scored = rows.map((row) => {
    const haystack = `${row.name} ${row.variableName ?? ""}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += token.length; // longer-token matches count more
      }
    }
    return {
      id: row.id,
      name: row.name,
      variableName: row.variableName,
      unit: row.unit,
      category: row.category,
      dataType: row.dataType,
      isKpi: row.isKpi,
      matchScore: score,
    } satisfies CandidateDefinition;
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, MAX_CANDIDATE_DEFS);
};

interface ValueRow {
  inputName: string;
  unit: string | null;
  value: string | null;
  dataType: string | null;
  managedListLabel: string | null;
  status: string;
  periodId: number;
  energySource: string | null;
  energyProvider: string | null;
  customerType: string | null;
  paymentMode: string | null;
}

const fetchValueRows = async (
  candidateIds: number[],
  periodIds: number[],
  dimensionFilters: DimensionMatch[],
): Promise<ValueRow[]> => {
  if (candidateIds.length === 0 || periodIds.length === 0) return [];

  const rows = await db.execute<{
    input_name: string;
    unit_name: string | null;
    value: string | null;
    data_type: string | null;
    managed_list_label: string | null;
    status_id: number | null;
    report_period_id: number;
    energy_source: string | null;
    energy_provider: string | null;
    customer_type: string | null;
    payment_mode: string | null;
  }>(sql`
    select
      idf.name as input_name,
      u.name as unit_name,
      de.value,
      dt.name as data_type,
      mlv.name as managed_list_label,
      de.status_id,
      de.report_period_id,
      es.name as energy_source,
      ep.name as energy_provider,
      ct.name as customer_type,
      pm.name as payment_mode
    from data_entries de
    inner join input_definitions idf on idf.id = de.input_def_id
    left join managed_list_items u on u.id = idf.unit_id
    left join managed_list_items dt on dt.id = idf.data_type_id
    left join managed_list_items mlv on mlv.id = (
      case
        when dt.name = 'managedLists' and de.value ~ '^[0-9]{1,9}$'
        then de.value::int
        else null
      end
    )
    left join managed_list_items es on es.id = de.energy_source_id
    left join managed_list_items ep on ep.id = de.energy_provider_id
    left join managed_list_items ct on ct.id = de.customer_type_id
    left join managed_list_items pm on pm.id = de.payment_mode_id
    where de.input_def_id = any(${candidateIds})
      and de.report_period_id = any(${periodIds})
      and de.is_deleted = false
      and de.is_relevant = true
      and de.status_id = any(${COMPLETION_STATUS_IDS})
      ${
        dimensionFilters.find((d) => d.field === "energy_source_id")
          ? sql`and de.energy_source_id = ${dimensionFilters.find((d) => d.field === "energy_source_id")!.id}`
          : sql``
      }
      ${
        dimensionFilters.find((d) => d.field === "energy_provider_id")
          ? sql`and de.energy_provider_id = ${dimensionFilters.find((d) => d.field === "energy_provider_id")!.id}`
          : sql``
      }
      ${
        dimensionFilters.find((d) => d.field === "customer_type_id")
          ? sql`and de.customer_type_id = ${dimensionFilters.find((d) => d.field === "customer_type_id")!.id}`
          : sql``
      }
      ${
        dimensionFilters.find((d) => d.field === "payment_mode_id")
          ? sql`and de.payment_mode_id = ${dimensionFilters.find((d) => d.field === "payment_mode_id")!.id}`
          : sql``
      }
    order by idf.name, de.report_period_id
    limit ${MAX_RESULT_ROWS}
  `);

  return rows.rows.map((row) => ({
    inputName: row.input_name,
    unit: row.unit_name,
    value: row.value,
    dataType: row.data_type,
    managedListLabel: row.managed_list_label,
    status: STATUS_LABELS[row.status_id ?? -1] ?? "Unknown",
    periodId: row.report_period_id,
    energySource: row.energy_source,
    energyProvider: row.energy_provider,
    customerType: row.customer_type,
    paymentMode: row.payment_mode,
  }));
};

const formatValue = (row: ValueRow): string => {
  const raw = row.value;
  if (raw === null || raw === undefined || raw === "") return "(null)";
  const dt = (row.dataType ?? "").toLowerCase();
  if (dt === "boolean") {
    if (raw === "true" || raw === "1") return "Yes";
    if (raw === "false" || raw === "0") return "No";
    return raw;
  }
  if (dt === "managedlists") {
    return row.managedListLabel ?? `(managed_list_item_id=${raw})`;
  }
  return raw;
};

const parseNumeric = (value: string | null): number | null => {
  if (value === null || value === undefined || value === "") return null;
  // strip commas / whitespace; allow negative + decimal
  const cleaned = value.replace(/[,\s]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const formatNumber = (n: number): string => {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

interface AggregateLine {
  inputName: string;
  unit: string | null;
  lines: string[];
}

const computeAggregates = (
  rows: ValueRow[],
  intent: AggregationIntent,
  periodLabelById: Map<number, string>,
): AggregateLine[] => {
  if (intent.ops.length === 0) return [];
  // group rows by input definition (keyed by inputName + unit)
  const groups = new Map<string, ValueRow[]>();
  for (const row of rows) {
    const dt = (row.dataType ?? "").toLowerCase();
    if (dt === "boolean" || dt === "managedlists") continue;
    const key = `${row.inputName}|${row.unit ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const out: AggregateLine[] = [];
  for (const [, groupRows] of groups) {
    const numeric = groupRows
      .map((r) => ({ row: r, n: parseNumeric(r.value) }))
      .filter((x): x is { row: ValueRow; n: number } => x.n !== null);

    const lines: string[] = [];
    if (numeric.length === 0) {
      lines.push(
        `(no numeric values in this group — values are non-numeric or null; aggregation skipped)`,
      );
    } else {
      const values = numeric.map((x) => x.n);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const unitSuffix =
        groupRows[0].unit && groupRows[0].unit !== "Units N/A"
          ? ` ${groupRows[0].unit}`
          : "";
      if (intent.ops.includes("sum"))
        lines.push(
          `sum(${values.length} rows) = ${formatNumber(sum)}${unitSuffix}`,
        );
      if (intent.ops.includes("average"))
        lines.push(
          `average(${values.length} rows) = ${formatNumber(avg)}${unitSuffix}`,
        );
      if (intent.ops.includes("min"))
        lines.push(`min = ${formatNumber(min)}${unitSuffix}`);
      if (intent.ops.includes("max"))
        lines.push(`max = ${formatNumber(max)}${unitSuffix}`);
      if (intent.ops.includes("count"))
        lines.push(`count(numeric rows) = ${values.length}`);

      if (
        (intent.ops.includes("difference") ||
          intent.ops.includes("percent_change")) &&
        intent.yearA &&
        intent.yearB
      ) {
        const sumForYear = (year: string): number | null => {
          const matched = numeric.filter(({ row }) => {
            const label = periodLabelById.get(row.periodId) ?? "";
            return label.includes(year);
          });
          if (matched.length === 0) return null;
          return matched.reduce((a, b) => a + b.n, 0);
        };
        const aSum = sumForYear(intent.yearA);
        const bSum = sumForYear(intent.yearB);
        if (aSum === null || bSum === null) {
          lines.push(
            `difference(${intent.yearB} vs ${intent.yearA}): missing data for ${aSum === null ? intent.yearA : intent.yearB}`,
          );
        } else {
          const diff = bSum - aSum;
          lines.push(
            `difference(${intent.yearB} − ${intent.yearA}) = ${formatNumber(diff)}${unitSuffix}  [${intent.yearA}=${formatNumber(aSum)}${unitSuffix}, ${intent.yearB}=${formatNumber(bSum)}${unitSuffix}]`,
          );
          if (intent.ops.includes("percent_change")) {
            if (aSum === 0) {
              lines.push(
                `percent_change(${intent.yearB} vs ${intent.yearA}) = undefined (base = 0)`,
              );
            } else {
              const pct = (diff / Math.abs(aSum)) * 100;
              lines.push(
                `percent_change(${intent.yearB} vs ${intent.yearA}) = ${formatNumber(pct)} %`,
              );
            }
          }
        }
      }
    }
    out.push({
      inputName: groupRows[0].inputName,
      unit: groupRows[0].unit,
      lines,
    });
  }
  return out;
};

export const buildInputValueLookupContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const tokens = tokenize(ctx.latestUserMessage);
  const periodIds = resolveScopePeriodIds(ctx);
  const aggregationIntent = detectAggregationIntent(ctx.latestUserMessage);

  if (tokens.length === 0) {
    return {
      capability: "input-value-lookup",
      contextBlock:
        "PRISM data grounding (input-value-lookup): unable to extract a specific input or KPI keyword from the question. Ask the user to name the input/KPI explicitly.",
    };
  }

  if (periodIds.length === 0) {
    return {
      capability: "input-value-lookup",
      contextBlock:
        "PRISM data grounding (input-value-lookup): no report periods are in scope, so no values can be returned.",
    };
  }

  const [candidates, dimensionFilters] = await Promise.all([
    findCandidateDefinitions(tokens),
    resolveDimensionMatches(ctx.latestUserMessage),
  ]);

  if (candidates.length === 0) {
    return {
      capability: "input-value-lookup",
      contextBlock: [
        "PRISM data grounding (input-value-lookup):",
        `- Tokens extracted from question: ${tokens.join(", ")}`,
        "- No active input or KPI definition matches those tokens.",
        "- Do not invent values. Tell the user the metric is not defined in PRISM and offer to list available categories or definitions.",
      ].join("\n"),
    };
  }

  const rows = await fetchValueRows(
    candidates.map((c) => c.id),
    periodIds,
    dimensionFilters,
  );

  // If the strict query returned nothing, run two diagnostic relaxations so
  // the LLM can give a useful answer instead of "I don't have it":
  //   (a) drop dimension filters but keep periods
  //   (b) drop period filter (sample any periods) but keep dimensions
  const [rowsWithoutDimensions, rowsWithoutPeriods] =
    rows.length === 0
      ? await Promise.all([
          dimensionFilters.length > 0
            ? fetchValueRows(
                candidates.map((c) => c.id),
                periodIds,
                [],
              )
            : Promise.resolve([]),
          fetchValueRows(
            candidates.map((c) => c.id),
            ctx.scopedPeriods.slice(0, 24).map((p) => p.Id),
            dimensionFilters,
          ),
        ])
      : [[], []];

  const candidateLines = candidates.map(
    (c) =>
      `- ${c.name}${c.variableName ? ` (var: ${c.variableName})` : ""} | category: ${c.category ?? "?"} | unit: ${c.unit ?? "?"} | type: ${c.isKpi ? "KPI" : "input"}`,
  );

  const periodLines = ctx.scopedPeriods
    .filter((p) => periodIds.includes(p.Id))
    .slice(0, 8)
    .map((p) => `- period_id=${p.Id}: ${p.Period} (${p.Utility || ""})`);

  const dimensionLine = dimensionFilters.length
    ? `Dimension filters detected in question: ${dimensionFilters
        .map((d) => `${d.field.replace("_id", "")}=${d.name}`)
        .join("; ")}`
    : "Dimension filters detected in question: none (results span all dimension values).";

  if (rows.length === 0) {
    const periodLabelById = new Map(
      ctx.scopedPeriods.map((p) => [p.Id, p.Period]),
    );
    const formatRowLine = (r: ValueRow): string => {
      const dims = [
        r.energySource ? `energy_source=${r.energySource}` : null,
        r.energyProvider ? `energy_provider=${r.energyProvider}` : null,
        r.customerType ? `customer_type=${r.customerType}` : null,
        r.paymentMode ? `payment_mode=${r.paymentMode}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const unit = r.unit && r.unit !== "Units N/A" ? ` ${r.unit}` : "";
      const periodLabel =
        periodLabelById.get(r.periodId) ?? `period_id=${r.periodId}`;
      return `    · ${r.inputName} = ${formatValue(r)}${unit} | period: ${periodLabel}${dims ? ` | ${dims}` : ""}`;
    };

    const altRowsExist =
      rowsWithoutPeriods.length > 0 || rowsWithoutDimensions.length > 0;
    const lines: string[] = [
      "PRISM data grounding (input-value-lookup):",
      `Candidate input/KPI definitions matched (top ${candidates.length}):`,
      ...candidateLines,
      dimensionLine,
      "Scoped report periods (the periods you queried):",
      ...periodLines,
      "Strict query (candidates + periods + dimensions) returned 0 rows for the EXACT scope requested.",
    ];

    if (rowsWithoutPeriods.length > 0) {
      lines.push(
        "",
        `IMPORTANT — DATA AVAILABLE FOR THIS METRIC IN OTHER PERIODS (${rowsWithoutPeriods.length} rows, same dimension filters, broader window):`,
        ...rowsWithoutPeriods.slice(0, 12).map(formatRowLine),
      );
    } else {
      lines.push(
        "- Broader-window relaxation (same dimensions, all periods): 0 rows.",
      );
    }

    if (rowsWithoutDimensions.length > 0) {
      lines.push(
        "",
        `Data available for this metric in the requested period(s) WITHOUT the dimension filter (${rowsWithoutDimensions.length} rows):`,
        ...rowsWithoutDimensions.slice(0, 8).map(formatRowLine),
      );
    } else if (dimensionFilters.length > 0) {
      lines.push(
        "- Dimension-dropped relaxation (same periods, no dim filter): 0 rows.",
      );
    }

    lines.push(
      "",
      "Required answer pattern:",
      altRowsExist
        ? "- DO NOT say 'I don't have this data'. Tell the user that the EXACT period requested has no entered/reviewed/approved value, then explicitly quote the value(s) above for the nearest period(s) and the dimension. Cite period label and dimension."
        : "- The metric has no entered/reviewed/approved data anywhere in scope; suggest checking pending entries on /data-entry.",
      "- Never invent a number that is not listed above.",
    );

    return {
      capability: "input-value-lookup",
      contextBlock: lines.join("\n"),
    };
  }

  const valueLines = rows.map((row) => {
    const dimChips = [
      row.energySource ? `energy_source=${row.energySource}` : null,
      row.energyProvider ? `energy_provider=${row.energyProvider}` : null,
      row.customerType ? `customer_type=${row.customerType}` : null,
      row.paymentMode ? `payment_mode=${row.paymentMode}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const dt = (row.dataType ?? "").toLowerCase();
    const showUnit =
      dt !== "boolean" &&
      dt !== "managedlists" &&
      row.unit &&
      row.unit !== "Units N/A";
    return `- ${row.inputName} = ${formatValue(row)}${showUnit ? ` ${row.unit}` : ""} | status=${row.status}, period_id=${row.periodId}${dimChips ? ` | ${dimChips}` : ""}`;
  });

  const periodLabelById = new Map<number, string>(
    ctx.scopedPeriods.map((p) => [p.Id, p.Period]),
  );
  const aggregates = computeAggregates(
    rows,
    aggregationIntent,
    periodLabelById,
  );
  const aggregateBlock: string[] =
    aggregationIntent.ops.length === 0
      ? []
      : [
          `Server-side aggregations (intent detected: ${aggregationIntent.ops.join(", ")}${
            aggregationIntent.yearA && aggregationIntent.yearB
              ? `; years ${aggregationIntent.yearA} vs ${aggregationIntent.yearB}`
              : ""
          }):`,
          ...aggregates.flatMap((a) => [
            `- ${a.inputName}:`,
            ...a.lines.map((l) => `    ${l}`),
          ]),
        ];

  return {
    capability: "input-value-lookup",
    contextBlock: [
      "PRISM data grounding (input-value-lookup):",
      `Candidate input/KPI definitions matched (top ${candidates.length}):`,
      ...candidateLines,
      dimensionLine,
      "Scoped report periods:",
      ...periodLines,
      `Returned data_entries rows (status in {Entered,Reviewed,Approved,Endorsed}, capped at ${MAX_RESULT_ROWS}):`,
      ...valueLines,
      ...aggregateBlock,
      "Guardrails:",
      "- Only quote the values and aggregations listed above. Do not invent or extrapolate.",
      "- If multiple candidate definitions matched, the question may be ambiguous — list the candidate names back to the user.",
      "- If a server-side aggregation is shown, prefer it over recomputing in your head.",
      "- For booleans / managed-list KPIs, aggregations are intentionally skipped (cannot be summed/averaged).",
      "- Cite the report period for every value (e.g., '2024-Q4', '2024 Annual') and include the unit.",
    ].join("\n"),
  };
};
