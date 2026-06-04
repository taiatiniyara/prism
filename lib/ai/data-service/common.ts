import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { eq } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
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
