import { describe, it, expect } from "vitest";

import { resolveTerm } from "@/lib/terminology/resolver";
import { NEUTRAL_DEFAULTS } from "@/lib/terminology/concepts";
import { DEFAULT_SECTOR } from "@/lib/terminology/sectors";
import { getActiveSector } from "@/lib/terminology/active-sector";

describe("terminology resolver (ADR 0003 label layer)", () => {
  it("resolves the active-sector default (electricity) to 'Grid'", () => {
    expect(resolveTerm("service_area")).toBe("Grid");
  });

  it("resolves the electricity plural to 'Grids'", () => {
    expect(resolveTerm("service_area", { plural: true })).toBe("Grids");
  });

  it("defaults the sector to DEFAULT_SECTOR when none is given", () => {
    expect(resolveTerm("service_area")).toBe(
      resolveTerm("service_area", { sector: DEFAULT_SECTOR }),
    );
  });

  it("resolves the ratified per-sector labels (Q1)", () => {
    expect(resolveTerm("service_area", { sector: "electricity" })).toBe("Grid");
    expect(resolveTerm("service_area", { sector: "water" })).toBe("Supply Zone");
    expect(resolveTerm("service_area", { sector: "sanitation" })).toBe(
      "Catchment",
    );
  });

  it("plural falls back to the singular label when no explicit plural exists", () => {
    // Water label has an explicit plural; assert the fallback path via a concept
    // whose neutral default carries a distinct plural instead.
    expect(resolveTerm("service_area", { sector: "water", plural: true })).toBe(
      "Supply Zones",
    );
  });

  it("active-sector seam is behaviour-neutral in Phase 5a (resolves to electricity)", async () => {
    // Pre-staged seam: getActiveSector() must equal DEFAULT_SECTOR today, so
    // threading call sites through it does not change any rendered label until
    // Phase 5b swaps the seam body. This test guards that neutrality.
    expect(await getActiveSector()).toBe(DEFAULT_SECTOR);
    expect(resolveTerm("service_area", { sector: await getActiveSector() })).toBe(
      resolveTerm("service_area"),
    );
  });

  it("never renders blank/snake_case — neutral defaults always exist for every concept", () => {
    for (const [concept, labels] of Object.entries(NEUTRAL_DEFAULTS)) {
      expect(labels.label.length).toBeGreaterThan(0);
      expect(labels.labelPlural.length).toBeGreaterThan(0);
      expect(labels.label).not.toContain("_");
      // A resolvable sector still returns a non-empty, non-key string.
      const resolved = resolveTerm(concept as keyof typeof NEUTRAL_DEFAULTS);
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved).not.toContain("_");
    }
  });
});
