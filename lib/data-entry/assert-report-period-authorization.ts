import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { hasGlobalUtilityAccess, type CurrentUser } from "@/lib/user.service";

/**
 * The shared compute-scope authorization check for both the KPI worker and the
 * aggregated (calculated-measure) worker: a global-utility user may compute any
 * scope; everyone else may only compute scopes whose report period belongs to
 * their own organisation.
 */
export const assertReportPeriodAuthorization = async (
  user: CurrentUser,
  scope: { reportPeriodId: number },
  label: string,
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
    throw new Error(`User is not authorized for ${label} scope.`);
  }
};
