import { describe, it, expect } from "vitest";
import { validateToolAccess } from "@/lib/ai/guardrails";
import type { AiToolName } from "@/lib/ai/types";

const ADMIN_ONLY_TOOLS: AiToolName[] = [
  "get_governance_audit",
  "get_configuration_options",
];

const PBI_TOOLS: AiToolName[] = [
  "query_power_bi",
  "diagnose_power_bi",
  "discover_datasets",
  "discover_schema",
  "discover_report",
  "pbi_schema",
  "pbi_query",
  "pbi_freshness",
];

describe("Tool access gating", () => {
  // Admin-only tools are restricted to DEV/BMO
  it("denies non-admin access to admin-only tools", () => {
    for (const tool of ADMIN_ONLY_TOOLS) {
      for (const role of ["BLO", "CEO", "EXT"]) {
        const result = validateToolAccess(tool, {
          id: "user", role, org_id: 1, name: null, email: `${role}@test.com`, image: null,
        } as never);
        expect(result.passed).toBe(false);
      }
    }
  });

  it("allows DEV/BMO access to admin-only tools", () => {
    for (const tool of ADMIN_ONLY_TOOLS) {
      for (const role of ["DEV", "BMO", "dev", "bmo"]) {
        const result = validateToolAccess(tool, {
          id: "user", role, org_id: 1, name: null, email: `${role}@test.com`, image: null,
        } as never);
        expect(result.passed).toBe(true);
      }
    }
  });

  // Power BI tools are available to ALL users — access is gated by Power BI configuration at the tool level
  it("allows all roles access to Power BI tools", () => {
    for (const tool of PBI_TOOLS) {
      for (const role of ["BLO", "CEO", "EXT", "DEV", "BMO", null]) {
        const result = validateToolAccess(tool, {
          id: "user", role: role as string | null, org_id: 1, name: null, email: `${role}@test.com`, image: null,
        } as never);
        expect(result.passed).toBe(true);
      }
    }
  });
});
