import { assertReportPeriodAuthorization } from "@/lib/data-entry/assert-report-period-authorization";
import type { CurrentUser } from "@/lib/user.service";

import type { KpiWorkerScope } from "./types";

export const assertKpiWorkerScopeAuthorization = (
  user: CurrentUser,
  scope: KpiWorkerScope,
): Promise<void> =>
  assertReportPeriodAuthorization(user, scope, "KPI worker");
