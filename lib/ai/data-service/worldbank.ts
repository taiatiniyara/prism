import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { eq } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import type { AiToolResult } from "../types";
import { createToolMetadata } from "./common";
import { logger } from "@/lib/logging/logger";

// ── Types ──

export interface WBCountryClassification {
  iso2Code: string;
  name: string;
  region: string;
  incomeLevel: string;
  lendingType: string;
  capitalCity: string;
}

export interface WBIndicator {
  code: string;
  name: string;
  value: number | null;
  year: string;
}

export interface WBProject {
  id: string;
  name: string;
  status: string;
  amount: string;
  sectors: string[];
  url: string;
}

export interface WBCountryContext {
  iso_code: string;
  country_name: string;
  income_level: string;
  lending_category: string;
  region: string;
  capital_city: string;
  indicators: WBIndicator[];
  active_projects: WBProject[];
  data_note: string;
}

// ── Constants ──

const WB_API = "https://api.worldbank.org/v2";
const CACHE = new Map<string, { data: WBCountryContext; ts: number }>();
const CACHE_TTL = 300_000; // 5 min

const INDICATOR_DEFS = [
  { code: "NY.GDP.PCAP.CD", name: "GDP per capita (current US$)" },
  { code: "SP.POP.TOTL", name: "Population, total" },
  { code: "EG.ELC.ACCS.ZS", name: "Access to electricity (% of population)" },
  { code: "EG.FEC.RNEW.ZS", name: "Renewable energy consumption (% of total final energy consumption)" },
  { code: "EN.ATM.CO2E.PC", name: "CO2 emissions (metric tons per capita)" },
];

// ── Fetch helpers ──

async function fetchWB<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    logger.warn("[worldbank] fetch failed", { url, error: String(e) });
    return null;
  }
}

// ── Public API ──

export async function getWorldBankCountryContext(
  isoCode: string,
): Promise<AiToolResult<WBCountryContext>> {
  const upper = isoCode.toUpperCase();

  const cached = CACHE.get(upper);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return {
      data: cached.data,
      metadata: createToolMetadata({ source: "world_bank_api", freshness: new Date(cached.ts) }),
    };
  }

  // 1. Country classification
  const raw = await fetchWB<[Record<string, unknown>, Record<string, unknown>[]]>(
    `${WB_API}/country/${upper}?format=json`,
  );

  if (!raw?.[1]?.length) {
    return {
      data: null as unknown as WBCountryContext,
      metadata: createToolMetadata({ source: "world_bank_api" }),
      error: `No World Bank data found for country code "${upper}".`,
    };
  }

  const c = raw[1][0] as Record<string, unknown>;
  const income = c.incomeLevel as Record<string, string> | undefined;
  const lending = c.lendingType as Record<string, string> | undefined;
  const region = c.region as Record<string, string> | undefined;

  // 2. Indicators (parallel)
  const indicatorResults = await Promise.all(
    INDICATOR_DEFS.map(async ({ code, name }) => {
      const d = await fetchWB<[unknown, Record<string, unknown>[]]>(
        `${WB_API}/country/${upper}/indicator/${code}?format=json&mrnev=1`,
      );
      if (d?.[1]?.length) {
        const item = d[1][0];
        return {
          code,
          name,
          value: (item.value as number) ?? null,
          year: (item.date as string) ?? "",
        };
      }
      return { code, name, value: null, year: "" };
    }),
  );

  const indicators: WBIndicator[] = indicatorResults.filter((i) => i.value !== null);

  // 3. Active projects
  const projRaw = await fetchWB<{ projects?: Record<string, Record<string, unknown>> }>(
    `https://search.worldbank.org/api/v2/projects?format=json&countrycode=${upper}&rows=5&status=Active`,
  );

  const activeProjects: WBProject[] = [];
  if (projRaw?.projects) {
    for (const [pid, p] of Object.entries(projRaw.projects)) {
      const sectors = (p.sector as Array<{ Name?: string }>) ?? [];
      activeProjects.push({
        id: pid,
        name: (p.project_name as string) ?? (p.projectname as string) ?? "",
        status: (p.status as string) ?? (p.projectstatusdisplay as string) ?? "",
        amount: (p.totalcommamt as string) ?? (p.totalamt as string) ?? "",
        sectors: sectors.map((s) => s.Name ?? "").filter(Boolean),
        url:
          (p.url as string) ??
          `https://projects.worldbank.org/en/projects-operations/project-detail/${pid}`,
      });
    }
  }

  const result: WBCountryContext = {
    iso_code: upper,
    country_name: (c.name as string) ?? upper,
    income_level: income?.value ?? "Not classified",
    lending_category: lending?.value ?? "Not classified",
    region: region?.value ?? "Unknown",
    capital_city: (c.capitalCity as string) ?? "",
    indicators,
    active_projects: activeProjects.slice(0, 5),
    data_note:
      "Data sourced from World Bank API. Indicators show the most recent available year. Project amounts are total commitments in USD.",
  };

  CACHE.set(upper, { data: result, ts: Date.now() });

  return {
    data: result,
    metadata: createToolMetadata({ source: "world_bank_api", freshness: new Date() }),
  };
}

// ── Utility: resolve user ISO code ──

export async function resolveUserIsoCode(user: CurrentUser): Promise<string | null> {
  if (!user.org_id) return null;

  try {
    const [org] = await db
      .select({ iso: countries.iso_code_alpha2 })
      .from(organisations)
      .innerJoin(countries, eq(organisations.country_id, countries.id))
      .where(eq(organisations.id, user.org_id))
      .limit(1);

    return org?.iso ?? null;
  } catch {
    return null;
  }
}
