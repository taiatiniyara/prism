export interface FilterContextFixture {
  reportTypeId: number | null;
  reportPeriodId: number | null;
  inputCategoryId: number | null;
  inputSubcategoryId: number | null;
  serviceAreaId: number | null;
  dataEntryStatusId: number | null;
}

export interface FilterOptionFixture {
  id: number;
  name: string;
}

export interface FilterOptionsFixture {
  reportTypes: FilterOptionFixture[];
  reportPeriods: FilterOptionFixture[];
  inputCategories: FilterOptionFixture[];
  inputSubcategories: FilterOptionFixture[];
  serviceAreas: FilterOptionFixture[];
  dataEntryStatuses: FilterOptionFixture[];
}

export const buildFilterContextFixture = (
  overrides: Partial<FilterContextFixture> = {},
): FilterContextFixture => ({
  reportTypeId: 1,
  reportPeriodId: 101,
  inputCategoryId: 515,
  inputSubcategoryId: 600,
  serviceAreaId: 10,
  dataEntryStatusId: null,
  ...overrides,
});

export const buildFilterOptionsFixture = (
  overrides: Partial<FilterOptionsFixture> = {},
): FilterOptionsFixture => ({
  reportTypes: [{ id: 1, name: "Monthly" }],
  reportPeriods: [{ id: 101, name: "2026-01" }],
  inputCategories: [{ id: 515, name: "Operational" }],
  inputSubcategories: [{ id: 600, name: "Generation" }],
  serviceAreas: [{ id: 10, name: "North Zone" }],
  dataEntryStatuses: [{ id: 1, name: "Pending" }],
  ...overrides,
});
