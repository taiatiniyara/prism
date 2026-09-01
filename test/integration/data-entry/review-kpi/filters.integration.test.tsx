import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReviewKpiFiltersClient from "@/app/data-entry/review-kpi/filters.client";
import { reviewKpiPageFixture } from "@/test/fixtures/review-kpi";

const mocks = vi.hoisted(() => ({
  updateFilter: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/data-entry/review-kpi/actions", () => ({
  updateReviewKpiFilterContextAction: mocks.updateFilter,
}));

vi.mock("@/components/data-entry/filterSelectors", () => {
  const MockSelect = ({
    label,
    onChange,
    disabled,
  }: {
    label: string;
    onChange: (value: number | null) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label={label}
      data-disabled={disabled ? "true" : "false"}
      onClick={() => onChange(null)}
    >
      {label}
    </button>
  );

  return {
    ReportTypeSelect: (props: { onChange: (value: number | null) => void; disabled?: boolean }) => (
      <MockSelect label="Report Type" {...props} />
    ),
    ReportPeriodSelect: (props: { onChange: (value: number | null) => void; disabled?: boolean }) => (
      <MockSelect label="Report Period" {...props} />
    ),
    KpiCategorySelect: (props: { onChange: (value: number | null) => void; disabled?: boolean }) => (
      <MockSelect label="KPI Category" {...props} />
    ),
    KpiSubcategorySelect: (props: { onChange: (value: number | null) => void; disabled?: boolean }) => (
      <MockSelect label="KPI Subcategory" {...props} />
    ),
    ServiceAreaSelect: (props: { onChange: (value: number | null) => void; disabled?: boolean }) => (
      <MockSelect label="Service Area" {...props} />
    ),
  };
});

describe("review kpi filters integration", () => {
  beforeEach(() => {
    mocks.updateFilter.mockResolvedValue(reviewKpiPageFixture.context);
    mocks.refresh.mockReset();
  });

  it("persists category changes and applies cascade to dependent selectors", async () => {
    render(
      <ReviewKpiFiltersClient
        context={reviewKpiPageFixture.context}
        options={reviewKpiPageFixture.options}
      />,
    );

    fireEvent.click(screen.getByLabelText("KPI Category"));

    await waitFor(() => {
      expect(mocks.updateFilter).toHaveBeenCalledWith("kpiCategoryId", null);
      expect(mocks.refresh).toHaveBeenCalled();
    });

    expect(screen.getByLabelText("KPI Subcategory")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });
});
