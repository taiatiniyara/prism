import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { hasGlobalUtilityAccess, type CurrentUser } from "@/lib/user.service";

import type { KpiWorkerScope } from "./types";

export const assertKpiWorkerScopeAuthorization = async (
  user: CurrentUser,
  scope: KpiWorkerScope,
): Promise<void> => {
  if (hasGlobalUtilityAccess(user)) {
    return;
  }

  const [reportPeriod] = await db
    .select({ utilityId: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, scope.reportPeriodId))
    .limit(1);

  if (!reportPeriod || reportPeriod.utilityId !== user.org_id) {
    throw new Error("User is not authorized for KPI worker scope.");
  }
};
