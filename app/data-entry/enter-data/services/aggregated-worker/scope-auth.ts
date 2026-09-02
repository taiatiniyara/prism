import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { assertReportPeriodAuthorization } from "@/lib/data-entry/assert-report-period-authorization";
import type { CurrentUser } from "@/lib/user.service";

export const assertScopeAuthorization = (
  user: CurrentUser,
  scope: AggregatedWorkerScope,
): Promise<void> =>
  assertReportPeriodAuthorization(user, scope, "aggregated worker");
