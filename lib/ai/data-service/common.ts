import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq, desc, and, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import type { AiToolMetadata } from "../types";

export interface AiDataServiceContext {
  user: CurrentUser;
  utility_id?: number | null;
  report_period_id?: number | null;
}

export const resolveUserUtility = async (
  user: CurrentUser,
  requested_utility_id?: number | null,
): Promise<{ id: number; name: string } | null> => {
  if (requested_utility_id) {
    const [org] = await db
      .select({ id: organisations.id, name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, requested_utility_id))
      .limit(1);
    return org ?? null;
  }

  if (user.org_id) {
    const [org] = await db
      .select({ id: organisations.id, name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, user.org_id))
      .limit(1);
    return org ?? null;
  }

  return null;
};

export const createToolMetadata = (options: {
  freshness?: Date | null;
  completeness_pct?: number | null;
  source?: string;
}): AiToolMetadata => {
  return {
    data_freshness: options.freshness ?? null,
    data_completeness_pct: options.completeness_pct ?? null,
    source: options.source,
  };
};

export const formatPercent = (value: number, total: number): string => {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
};

export const formatNumber = (value: number, decimals: number = 0): string => {
  return value.toFixed(decimals);
};

interface ResolvePeriodOptions {
  report_period_id?: number | null;
  year?: number | null;
  month?: number | null;
}

export const resolvePeriodId = async (
  user: CurrentUser,
  options: ResolvePeriodOptions = {},
): Promise<number | null> => {
  if (options.report_period_id) return options.report_period_id;

  const predicates = [];
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    predicates.push(eq(reportPeriods.utility_id, user.org_id));
  }
  if (options.year) {
    predicates.push(
      sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${options.year}`,
    );
  }
  if (options.month) {
    predicates.push(
      sql`EXTRACT(MONTH FROM ${reportPeriods.report_date}) = ${options.month}`,
    );
  }

  const [period] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(predicates.length > 0 ? and(...predicates) : sql`TRUE`)
    .orderBy(desc(reportPeriods.report_date))
    .limit(1);

  return period?.id ?? null;
};

export const resolveRecentPeriodIds = async (
  user: CurrentUser,
  limit: number = 5,
): Promise<number[]> => {
  const predicates = [];
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    predicates.push(eq(reportPeriods.utility_id, user.org_id));
  }

  const periods = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(predicates.length > 0 ? and(...predicates) : sql`TRUE`)
    .orderBy(desc(reportPeriods.report_date))
    .limit(limit);

  return periods.map((p) => p.id);
};

export const resolvePeriod = async (
  user: CurrentUser,
  options: ResolvePeriodOptions = {},
): Promise<{
  id: number;
  display: Date;
  utility: string | null;
  utilityId: number;
} | null> => {
  if (options.report_period_id) {
    const [period] = await db
      .select({
        id: reportPeriods.id,
        display: reportPeriods.report_date,
        utility: organisations.acronym,
        utilityId: reportPeriods.utility_id,
      })
      .from(reportPeriods)
      .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
      .where(eq(reportPeriods.id, options.report_period_id))
      .limit(1);
    return period ?? null;
  }

  const predicates = [];
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    predicates.push(eq(reportPeriods.utility_id, user.org_id));
  }
  if (options.year) {
    predicates.push(
      sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${options.year}`,
    );
  }
  if (options.month) {
    predicates.push(
      sql`EXTRACT(MONTH FROM ${reportPeriods.report_date}) = ${options.month}`,
    );
  }

  const [period] = await db
    .select({
      id: reportPeriods.id,
      display: reportPeriods.report_date,
      utility: organisations.acronym,
      utilityId: reportPeriods.utility_id,
    })
    .from(reportPeriods)
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .where(predicates.length > 0 ? and(...predicates) : sql`TRUE`)
    .orderBy(desc(reportPeriods.report_date))
    .limit(1);

  return period ?? null;
};

export const MANAGED_LIST_PARENT_IDS = {
  ENERGY_SOURCE: 12,
  ENERGY_PROVIDER: 13,
  ENERGY_TYPE: 15,
  ENERGY_RESOURCE: 20,
  AGGREGATION_LEVEL: 27,
  CUSTOMER_TYPE: 29,
  PAYMENT_MODE: 31,
} as const;

export const getSeverityScore = (status: string | null): number => {
  if (!status) return 0;
  const normalized = status.toLowerCase();
  if (normalized.includes("off")) return 3;
  if (normalized.includes("risk")) return 2;
  if (normalized.includes("track") || normalized.includes("good")) return 1;
  return 0;
};
