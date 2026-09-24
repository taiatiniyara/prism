import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import type { ReviewKpiRow } from "@/app/data-entry/review-kpi/types";
import { reviewKpiFilterFixture } from "@/test/fixtures/review-kpi";

vi.mock("@/app/data-entry/review-kpi/use-review-kpi-sync", () => ({
  useReviewKpiSync: () => ({ isConnected: true, error: null }),
}));

// Regression for the browser console warning:
//   "Encountered two children with the same key, `<kpiDefId>-<uuid>`"
//
// Root cause: a KPI's own `formula_inputs` can pin two DISTINCT variables to
// the exact same dimension slice — this happens today for real, in
// production, on kpi_def_id 62 ("finance_employees_female" mistakenly
// bound to the Executive division), 63 ("Total Employees" binds both
// `employees_male` and `employees_female` to the identical All/All slice),
// and 80. When that happens, `listReviewKpiRows` correctly attaches the SAME
// `dataEntryId` to both bindings — there is genuinely one row feeding two
// formula variables. `dataEntryId` alone is therefore not a safe React list
// key for `row.inputs`; the render key must also fold in `variableName`
// (unique per binding within one formula) to stay collision-free.
const sharedDataEntryId = "a5f9f551-124e-42e3-9752-9098a18d024c";

const buildRow = (): ReviewKpiRow => ({
  kpiDefId: 63,
  kpiName: "Total Employees",
  unitName: null,
  formulaText: "employees_male + employees_female",
  categoryId: null,
  subcategoryId: null,
  reportPeriodId: reviewKpiFilterFixture.reportPeriodId ?? 202401,
  serviceAreaId: reviewKpiFilterFixture.serviceAreaId,
  inputs: [
    {
      dataEntryId: sharedDataEntryId,
      inputDefId: 260,
      inputName: "Employees",
      unitName: null,
      value: "42",
      controlType: "number",
      comments: [],
      updatedAt: "2026-03-24T00:00:00.000Z",
      updatedById: "u-1",
      variableName: "employees_male",
    },
    {
      // Same underlying data_entries row (measure + dimension slice is
      // identical), a DIFFERENT formula variable.
      dataEntryId: sharedDataEntryId,
      inputDefId: 260,
      inputName: "Employees",
      unitName: null,
      value: "42",
      controlType: "number",
      comments: [],
      updatedAt: "2026-03-24T00:00:00.000Z",
      updatedById: "u-1",
      variableName: "employees_female",
    },
  ],
  result: {
    kpiId: "b7a1e9d4-4f19-4664-8422-c4e16073b4ad",
    value: "84",
    status: "calculated",
    calculatedAt: "2026-03-24T00:00:00.000Z",
    formulaVersion: "v1",
  },
});

describe("review kpi row — inputs sharing one dataEntryId across two bindings", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders both bindings without a duplicate-key warning", () => {
    render(
      <ReviewKpiRowCard
        row={buildRow()}
        context={reviewKpiFilterFixture}
      />,
    );

    // Both input cards render — the shared dataEntryId did not cause one to
    // be dropped by React's reconciliation.
    expect(
      screen.getAllByRole("textbox", { name: "Employees value" }),
    ).toHaveLength(2);

    // React logs this as `console.error("...same key, `%s`...", key)` — the
    // offending key is a separate arg, not interpolated into the message.
    const duplicateKeyWarning = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) => {
        const [message, key] = call;
        return (
          typeof message === "string" &&
          message.includes("same key") &&
          typeof key === "string" &&
          key.startsWith("63-")
        );
      },
    );
    expect(duplicateKeyWarning).toBeUndefined();
  });
});
