import { describe, expect, it } from "vitest";

import {
  isGenerationContext,
  isOperationalContext,
} from "@/app/data-entry/enter-data/services/us3.conditionalViews.service";
import { buildFilterContextFixture } from "@/test/fixtures/data-entry-filters";

describe("conditional context flags", () => {
  it("marks operational context only when category is operational", () => {
    const context = buildFilterContextFixture({ inputCategoryId: 515 });

    expect(
      isOperationalContext(context, [
        { id: 515, name: "Operational" },
        { id: 900, name: "Other" },
      ]),
    ).toBe(true);

    expect(
      isOperationalContext({ ...context, inputCategoryId: 900 }, [
        { id: 515, name: "Operational" },
      ]),
    ).toBe(false);
  });

  it("marks generation context only when subcategory is generation", () => {
    const context = buildFilterContextFixture({ inputSubcategoryId: 600 });

    expect(
      isGenerationContext(context, [
        { id: 600, name: "Generation" },
        { id: 601, name: "Distribution" },
      ]),
    ).toBe(true);

    expect(
      isGenerationContext({ ...context, inputSubcategoryId: 601 }, [
        { id: 600, name: "Generation" },
      ]),
    ).toBe(false);
  });
});
