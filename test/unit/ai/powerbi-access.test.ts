import { describe, it, expect } from "vitest";
import { validateToolAccess } from "@/lib/ai/guardrails";
import type { AiToolName } from "@/lib/ai/types";

const PBI_TOOLS: AiToolName[] = [
  "query_power_bi",
  "diagnose_power_bi",
  "discover_datasets",
  "discover_schema",
  "discover_report",
];

describe("Power BI admin access gating", () => {
  it("denies BLO role access to all PBI tools", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-1",
        role: "BLO",
        org_id: 1,
        name: null,
        email: "test@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(false);
      expect(result.rule).toBe("TOOL-ADMIN-ONLY");
    }
  });

  it("denies CEO role access to all PBI tools", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-2",
        role: "CEO",
        org_id: 1,
        name: null,
        email: "ceo@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(false);
    }
  });

  it("denies EXT role access to all PBI tools", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-3",
        role: "EXT",
        org_id: null,
        name: null,
        email: "ext@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(false);
    }
  });

  it("denies null-role users access to all PBI tools", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-4",
        role: null,
        org_id: 1,
        name: null,
        email: "norole@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(false);
    }
  });

  it("allows DEV role access to all PBI tools", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-5",
        role: "DEV",
        org_id: null,
        name: null,
        email: "dev@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(true);
    }
  });

  it("allows BMO role access to all PBI tools", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-6",
        role: "BMO",
        org_id: null,
        name: null,
        email: "bmo@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(true);
    }
  });

  it("allows lowercase dev role access", () => {
    for (const tool of PBI_TOOLS) {
      const result = validateToolAccess(tool, {
        id: "user-7",
        role: "dev",
        org_id: null,
        name: null,
        email: "dev2@example.com",
        image: null,
      } as never);
      expect(result.passed).toBe(true);
    }
  });
});
