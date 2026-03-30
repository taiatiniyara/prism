import { describe, expect, it } from "vitest";

import {
  applyCascadedContextWithOptionValidation,
  buildInputRowsFromDefinitions,
  filterInputDefinitionsByContext,
} from "@/app/data-entry/enter-data/services/us2.cascadeFiltering.service";
import {
  buildFilterContextFixture,
  buildFilterOptionsFixture,
} from "@/test/fixtures/data-entry-filters";

describe("filter cascade behavior", () => {
  it("clears invalid downstream selections after category change", () => {
    const context = buildFilterContextFixture({
      inputCategoryId: 515,
      inputSubcategoryId: 600,
      serviceAreaId: 10,
    });

    const options = buildFilterOptionsFixture({
      inputSubcategories: [{ id: 700, name: "Distribution" }],
      serviceAreas: [{ id: 11, name: "South Zone" }],
    });

    const next = applyCascadedContextWithOptionValidation(
      context,
      "inputCategoryId",
      900,
      {
        reportPeriods: options.reportPeriods,
        inputSubcategories: options.inputSubcategories,
        serviceAreas: options.serviceAreas,
      },
    );

    expect(next.inputCategoryId).toBe(900);
    expect(next.inputSubcategoryId).toBeNull();
    expect(next.serviceAreaId).toBeNull();
  });

  it("filters rows by category and subcategory context", () => {
    const context = buildFilterContextFixture({
      inputCategoryId: 515,
      inputSubcategoryId: 600,
      serviceAreaId: 10,
    });

    const definitions = [
      {
        id: 1,
        name: "Gen MWh",
        categoryId: 515,
        subcategoryId: 600,
        dataTypeId: 1,
        dataTypeName: "number",
        unitName: "MWh",
      },
      {
        id: 2,
        name: "Station Name",
        categoryId: 515,
        subcategoryId: 601,
        dataTypeId: 2,
        dataTypeName: "text",
        unitName: null,
      },
      {
        id: 3,
        name: "Safety",
        categoryId: 999,
        subcategoryId: 700,
        dataTypeId: 3,
        dataTypeName: "boolean",
        unitName: null,
      },
    ];

    const filtered = filterInputDefinitionsByContext(definitions, context);
    expect(filtered.map((item) => item.id)).toEqual([1]);

    const rows = buildInputRowsFromDefinitions(
      filtered,
      [
        {
          id: "entry-1",
          inputDefId: 1,
          serviceAreaId: 10,
          value: "123",
          comments: [
            {
              comment: "ok",
              commenterId: "u-1",
              commenterRole: "DEV",
              date: new Date("2026-01-01T00:00:00.000Z"),
            },
          ],
        },
      ],
      context,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.inputDefId).toBe(1);
    expect(rows[0]?.value).toBe("123");
  });
});
