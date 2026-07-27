import { describe, it, expect } from "vitest";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import {
  filterAccessibleReportPeriods,
  FINANCIAL_YEAR_REPORT_TYPE,
} from "@/lib/ai/data-service/common";
import type { CurrentUser } from "@/lib/user.service";
import type { ReportPeriodDTO } from "@/app/data-entry/service";

// Regression guard for AI-side multi-tenant isolation (S9, security review
// 2026-07-26). These pure functions are the primitives every AI data-service
// tool relies on to keep one utility's data private from another. A change
// here that widens access would silently break tenant isolation, so we pin
// the exact policy:
//   - Only BMO (always) and DEV (unless pinned to a utility context) get
//     cross-utility "global" access. Every other role is confined to its org.
//   - Even a global-access user may only reach OTHER utilities' "Financial
//     Year" periods — never another utility's Monthly datasets.
//
// Note on the tool `utility_id` argument: the AI tools accept a `utility_id`
// parameter, but the data-service scopes queries by the SESSION user
// (`resolveUtilityScopeId(user)` / `hasGlobalUtilityAccess(user)`), not by that
// request-supplied value — so a non-admin passing a foreign `utility_id`
// cannot read another utility's data. That enforcement is exercised end-to-end
// by the integration suite; here we lock the pure primitives it builds on.

const mkUser = (
  role: string | null,
  org_id: number | null,
  extra: Partial<CurrentUser> = {},
): CurrentUser =>
  ({
    id: "u",
    role,
    org_id,
    name: null,
    email: "u@test.com",
    image: null,
    ...extra,
  }) as CurrentUser;

const mkPeriod = (utilityId: number, reportType: string): ReportPeriodDTO =>
  ({ Utility_id: utilityId, Report_Type: reportType }) as unknown as ReportPeriodDTO;

describe("hasGlobalUtilityAccess — cross-utility access is role-gated", () => {
  it("grants global access to BMO", () => {
    expect(hasGlobalUtilityAccess(mkUser("BMO", 5))).toBe(true);
  });

  it("grants global access to DEV only when not pinned to a utility context", () => {
    expect(hasGlobalUtilityAccess(mkUser("DEV", 5))).toBe(true);
    expect(
      hasGlobalUtilityAccess(mkUser("DEV", 5, { is_utility_context_scoped: true })),
    ).toBe(false);
  });

  it("denies global access to every non-admin role", () => {
    for (const role of ["BLO", "CEO", "MGR", "EXE", "EXT", "DAOF", "DAOH", "DAOO", null]) {
      expect(hasGlobalUtilityAccess(mkUser(role, 5))).toBe(false);
    }
  });
});

describe("filterAccessibleReportPeriods — Monthly data stays private", () => {
  const ownMonthly = mkPeriod(5, "Monthly");
  const ownFy = mkPeriod(5, FINANCIAL_YEAR_REPORT_TYPE);
  const otherMonthly = mkPeriod(9, "Monthly");
  const otherFy = mkPeriod(9, FINANCIAL_YEAR_REPORT_TYPE);
  const all = [ownMonthly, ownFy, otherMonthly, otherFy];

  it("is a no-op for non-global users (upstream query already scopes them to their org)", () => {
    const result = filterAccessibleReportPeriods(mkUser("BLO", 5), all);
    expect(result).toEqual(all);
  });

  it("lets a global user see own utility fully but only OTHER utilities' Financial Year periods", () => {
    const result = filterAccessibleReportPeriods(mkUser("BMO", 5), all);
    expect(result).toContain(ownMonthly);
    expect(result).toContain(ownFy);
    expect(result).toContain(otherFy);
    // The critical assertion: another utility's Monthly dataset is filtered out.
    expect(result).not.toContain(otherMonthly);
  });

  it("blocks all foreign Monthly periods for a global user with no org of their own", () => {
    const result = filterAccessibleReportPeriods(mkUser("BMO", null), all);
    expect(result).not.toContain(ownMonthly);
    expect(result).not.toContain(otherMonthly);
    expect(result).toContain(ownFy);
    expect(result).toContain(otherFy);
  });
});
