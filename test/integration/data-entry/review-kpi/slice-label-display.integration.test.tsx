import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import type { ReviewKpiRow } from "@/app/data-entry/review-kpi/types";
import { reviewKpiFilterFixture } from "@/test/fixtures/review-kpi";

vi.mock("@/app/data-entry/review-kpi/use-review-kpi-sync", () => ({
  useReviewKpiSync: () => ({ isConnected: true, error: null }),
}));

// Regression for "it seems like a lot of inputs are being repeated": KPI 62
// "Total Employees Female" legitimately binds "Employees" nine times, once
// per division. Before this fix, every card showed the bare name "Employees"
// with nothing to distinguish them. This asserts each card now also shows
// its resolved dimension-slice label.
const buildRow = (): ReviewKpiRow => ({
  kpiDefId: 62,
  kpiName: "Total Employees Female",
  unitName: null,
  formulaText: "finance_employees_female + executive_employees_female + ...",
  categoryId: null,
  subcategoryId: null,
  reportPeriodId: reviewKpiFilterFixture.reportPeriodId ?? 202401,
  serviceAreaId: reviewKpiFilterFixture.serviceAreaId,
  inputs: [
    {
      dataEntryId: "d1c53fae-3c81-498b-bcaf-746a9f1cda9d",
      inputDefId: 260,
      inputName: "Employees",
      unitName: null,
      value: "12",
      controlType: "number",
      comments: [],
      updatedAt: "2026-03-24T00:00:00.000Z",
      updatedById: "u-1",
      variableName: "finance_employees_female",
      sliceLabel: "Finance • Female",
    },
    {
      dataEntryId: "5414d8e9-d9ae-4b97-bdec-2a2d4dd6fef3",
      inputDefId: 260,
      inputName: "Employees",
      unitName: null,
      value: "8",
      controlType: "number",
      comments: [],
      updatedAt: "2026-03-24T00:00:00.000Z",
      updatedById: "u-1",
      variableName: "executive_employees_female",
      sliceLabel: "Executive • Female",
    },
  ],
  result: {
    kpiId: "b7a1e9d4-4f19-4664-8422-c4e16073b4ad",
    value: "20",
    status: "calculated",
    calculatedAt: "2026-03-24T00:00:00.000Z",
    formulaVersion: "v1",
  },
});

describe("review kpi row — dimension-slice labels", () => {
  it("shows a distinguishing slice label under each repeated-name input", () => {
    render(
      <ReviewKpiRowCard
        row={buildRow()}
        context={reviewKpiFilterFixture}
      />,
    );

    expect(screen.getAllByText("Employees")).toHaveLength(2);
    expect(screen.getByText("Finance • Female")).toBeInTheDocument();
    expect(screen.getByText("Executive • Female")).toBeInTheDocument();
  });
});