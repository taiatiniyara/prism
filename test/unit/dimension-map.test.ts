import { describe, expect, it } from "vitest";
import {
  DIMENSIONS,
  CANONICAL_DIMENSIONS,
  SCOPE_KEY_TO_FIELD,
  ALL_MEMBER_BY_FIELD,
  dimensionByField,
  dimensionByScopeKey,
  resolveDimension,
  isKnownDimension,
} from "@/lib/dimensions/dimension-map";

describe("dimension-map: structural integrity", () => {
  it("defines exactly the 10 canonical dimensions", () => {
    expect(DIMENSIONS).toHaveLength(10);
    expect(CANONICAL_DIMENSIONS).toHaveLength(10);
  });

  it("has unique field / scopeKey / listName / label / codeAlias / allMember across dimensions", () => {
    for (const key of ["field", "scopeKey", "listName", "label", "codeAlias", "allMember"] as const) {
      const values = DIMENSIONS.map((d) => d[key]);
      expect(new Set(values).size, `duplicate ${key}`).toBe(DIMENSIONS.length);
    }
  });

  it("derived lookup maps agree with DIMENSIONS", () => {
    for (const d of DIMENSIONS) {
      expect(SCOPE_KEY_TO_FIELD[d.scopeKey]).toBe(d.field);
      expect(ALL_MEMBER_BY_FIELD[d.field]).toBe(d.allMember);
      expect(dimensionByField(d.field)).toBe(d);
      expect(dimensionByScopeKey(d.scopeKey)).toBe(d);
    }
  });

  it("has no synonym/term collisions (every recognised term maps to one dimension)", () => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const seen = new Map<string, string>();
    for (const d of DIMENSIONS) {
      for (const term of [d.scopeKey, d.field, d.label, d.codeAlias, ...d.synonyms]) {
        const n = norm(term);
        const prior = seen.get(n);
        expect(prior === undefined || prior === d.scopeKey, `term "${term}" collides (${prior} vs ${d.scopeKey})`).toBe(true);
        seen.set(n, d.scopeKey);
      }
    }
  });
});

describe("dimension-map: physical column pins (guard against silently querying the wrong column)", () => {
  const pin: Record<string, string> = {
    provider: "provider_id",
    type: "category_id",
    source: "technology_id",
    resource_type: "asset_class_id",
    customer_type: "customer_type_id",
    payment_mode: "payment_mode_id",
    band: "consumption_band_id",
    division: "division_id",
    gender: "gender_id",
    utility_function: "utility_function_id",
  };
  it.each(Object.entries(pin))("%s -> %s", (scopeKey, field) => {
    expect(dimensionByScopeKey(scopeKey)?.field).toBe(field);
  });
});

describe("dimension-map: terminology traps (Technology vs Category vs Asset Class)", () => {
  it("'energy source' / 'fuel' / 'energy mix' resolve to Technology (source → technology_id)", () => {
    for (const term of ["energy source", "fuel", "fuel type", "energy mix", "generation source", "Technology"]) {
      expect(resolveDimension(term)?.field, term).toBe("technology_id");
    }
  });

  it("'energy type' / 'category' resolve to Category (type → category_id), NOT Technology", () => {
    for (const term of ["energy type", "category", "renewable classification"]) {
      expect(resolveDimension(term)?.field, term).toBe("category_id");
    }
  });

  it("'asset class' / 'unit type' resolve to Asset Class (resource_type → asset_class_id)", () => {
    for (const term of ["asset class", "unit type", "asset type"]) {
      expect(resolveDimension(term)?.field, term).toBe("asset_class_id");
    }
  });

  it("energy-source phrasings do NOT leak into resource_type/Asset Class", () => {
    for (const term of ["energy source", "fuel", "energy mix"]) {
      expect(resolveDimension(term)?.scopeKey, term).not.toBe("resource_type");
    }
  });

  it("resolves canonical keys, columns, labels and aliases too", () => {
    expect(resolveDimension("source")?.field).toBe("technology_id");
    expect(resolveDimension("technology_id")?.scopeKey).toBe("source");
    expect(resolveDimension("Consumption Band")?.field).toBe("consumption_band_id");
    expect(resolveDimension("energySource")?.field).toBe("technology_id");
  });

  it("returns undefined for unknown terms (never guesses)", () => {
    expect(resolveDimension("sales region")).toBeUndefined();
    expect(isKnownDimension("sales region")).toBe(false);
    expect(isKnownDimension("fuel")).toBe(true);
  });
});
