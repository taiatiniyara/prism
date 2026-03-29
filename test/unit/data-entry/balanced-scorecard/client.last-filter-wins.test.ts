import { describe, expect, it, vi } from "vitest";
import {
  fetchScorecard,
  isLatestRequest,
} from "@/app/data-entry/balanced-scorecard/client";

describe("scorecard client last-filter-wins", () => {
  it("tracks latest request id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        context: {
          reportPeriodId: 1,
          reportTypeId: null,
          serviceAreaId: null,
          kpiCategoryId: null,
          kpiSubcategoryId: null,
        },
        snapshot: {
          generatedAt: new Date().toISOString(),
          overallScore: 0,
          perspectiveScores: [],
          excludedSummary: { totalExcluded: 0, byReason: {} },
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const first = await fetchScorecard({
      reportPeriodId: 1,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    });

    const second = await fetchScorecard({
      reportPeriodId: 2,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    });

    expect(isLatestRequest(first.requestId)).toBe(false);
    expect(isLatestRequest(second.requestId)).toBe(true);
    vi.unstubAllGlobals();
  });
});
