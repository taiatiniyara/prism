import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildAggregatedTarget } from "@/test/fixtures/aggregated-formulas";

const mocks = vi.hoisted(() => ({
  assertScopeAuthorization: vi.fn(),
  selectAggregatedFormulaTargets: vi.fn(),
  buildSourceSnapshot: vi.fn(),
  writeCalculatedTargetValue: vi.fn(),
  storeRunStart: vi.fn(),
  storeRunOutcomes: vi.fn(),
}));

vi.mock(
  "@/app/data-entry/enter-data/services/aggregated-worker/scope-auth",
  () => ({
    assertScopeAuthorization: mocks.assertScopeAuthorization,
  }),
);

vi.mock(
  "@/app/data-entry/enter-data/services/aggregated-worker/target-selector",
  () => ({
    selectAggregatedFormulaTargets: mocks.selectAggregatedFormulaTargets,
  }),
);

vi.mock(
  "@/app/data-entry/enter-data/services/aggregated-worker/snapshot-builder",
  () => ({
    buildSourceSnapshot: mocks.buildSourceSnapshot,
  }),
);

vi.mock(
  "@/app/data-entry/enter-data/services/aggregated-worker/target-writer",
  () => ({
    writeCalculatedTargetValue: mocks.writeCalculatedTargetValue,
  }),
);

vi.mock(
  "@/app/data-entry/enter-data/services/aggregated-worker/outcome-store",
  () => ({
    storeRunStart: mocks.storeRunStart,
    storeRunOutcomes: mocks.storeRunOutcomes,
  }),
);

describe("aggregated worker orchestrator cascade", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.assertScopeAuthorization.mockResolvedValue(undefined);
    mocks.writeCalculatedTargetValue.mockResolvedValue(undefined);
    mocks.buildSourceSnapshot.mockResolvedValue({
      capturedAt: "2026-01-01T00:00:00.000Z",
      scope: { reportPeriodId: 12 },
      values: {
        byVariable: { A: "3", B: "4", C: null },
        byInputDefId: {},
      },
    });
  });

  it("calculates downstream aggregated targets after upstream updates", async () => {
    mocks.selectAggregatedFormulaTargets.mockResolvedValue([
      buildAggregatedTarget({
        inputDefId: 2001,
        variableName: "C",
        formula: "A + B",
        formulaInputs: [
          { input_def_id: 11, variable_name: "A" },
          { input_def_id: 12, variable_name: "B" },
        ],
      }),
      buildAggregatedTarget({
        inputDefId: 2002,
        variableName: "D",
        formula: "C * 2",
        formulaInputs: [{ input_def_id: 2001, variable_name: "C" }],
      }),
    ]);

    const { runAggregatedWorker } =
      await import("@/app/data-entry/enter-data/services/aggregated-worker/orchestrator");

    const result = await runAggregatedWorker({ id: "user-1" } as never, {
      reportPeriodId: 12,
    });

    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputDefId: 2001,
          status: "calculated",
          calculatedValue: "7",
        }),
        expect.objectContaining({
          inputDefId: 2002,
          status: "calculated",
          calculatedValue: "14",
        }),
      ]),
    );

    expect(mocks.writeCalculatedTargetValue).toHaveBeenCalledTimes(2);
    expect(mocks.writeCalculatedTargetValue).toHaveBeenNthCalledWith(1, {
      inputDefId: 2001,
      value: "7",
      scope: { reportPeriodId: 12 },
    });
    expect(mocks.writeCalculatedTargetValue).toHaveBeenNthCalledWith(2, {
      inputDefId: 2002,
      value: "14",
      scope: { reportPeriodId: 12 },
    });
  });

  it("propagates cascade when upstream target variable name is missing", async () => {
    mocks.selectAggregatedFormulaTargets.mockResolvedValue([
      buildAggregatedTarget({
        inputDefId: 3001,
        variableName: null,
        formula: "A + B",
        formulaInputs: [
          { input_def_id: 11, variable_name: "A" },
          { input_def_id: 12, variable_name: "B" },
        ],
      }),
      buildAggregatedTarget({
        inputDefId: 3002,
        variableName: "NET",
        formula: "TOTAL_EXP * 2",
        formulaInputs: [{ input_def_id: 3001, variable_name: "TOTAL_EXP" }],
      }),
    ]);

    const { runAggregatedWorker } =
      await import("@/app/data-entry/enter-data/services/aggregated-worker/orchestrator");

    const result = await runAggregatedWorker({ id: "user-1" } as never, {
      reportPeriodId: 12,
    });

    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputDefId: 3001,
          status: "calculated",
          calculatedValue: "7",
        }),
        expect.objectContaining({
          inputDefId: 3002,
          status: "calculated",
          calculatedValue: "14",
        }),
      ]),
    );
  });

  it("uses input definition mapping for chained formulas", async () => {
    mocks.buildSourceSnapshot.mockResolvedValue({
      capturedAt: "2026-01-01T00:00:00.000Z",
      scope: { reportPeriodId: 12 },
      values: {
        byVariable: {
          OPERATING_INCOME: "50",
          OTHER_INCOME: "10",
          OPERATING_EXPENSES: "40",
          ADMIN_EXPENSES: "5",
          TOTAL_EXPENSES: "999",
          TOTAL_INCOME: "999",
        },
        byInputDefId: {
          101: "50",
          102: "10",
          201: "40",
          202: "5",
        },
      },
    });

    mocks.selectAggregatedFormulaTargets.mockResolvedValue([
      buildAggregatedTarget({
        inputDefId: 301,
        variableName: "TOTAL_EXPENSES",
        formula: "OPERATING_EXPENSES + ADMIN_EXPENSES",
        formulaInputs: [
          { input_def_id: 201, variable_name: "OPERATING_EXPENSES" },
          { input_def_id: 202, variable_name: "ADMIN_EXPENSES" },
        ],
      }),
      buildAggregatedTarget({
        inputDefId: 302,
        variableName: "TOTAL_INCOME",
        formula: "OPERATING_INCOME + OTHER_INCOME",
        formulaInputs: [
          { input_def_id: 101, variable_name: "OPERATING_INCOME" },
          { input_def_id: 102, variable_name: "OTHER_INCOME" },
        ],
      }),
      buildAggregatedTarget({
        inputDefId: 303,
        variableName: "NET_PROFIT",
        formula: "TOTAL_INCOME - TOTAL_EXPENSES",
        formulaInputs: [
          { input_def_id: 302, variable_name: "TOTAL_INCOME" },
          { input_def_id: 301, variable_name: "TOTAL_EXPENSES" },
        ],
      }),
    ]);

    const { runAggregatedWorker } =
      await import("@/app/data-entry/enter-data/services/aggregated-worker/orchestrator");

    const result = await runAggregatedWorker({ id: "user-1" } as never, {
      reportPeriodId: 12,
    });

    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputDefId: 301,
          status: "calculated",
          calculatedValue: "45",
        }),
        expect.objectContaining({
          inputDefId: 302,
          status: "calculated",
          calculatedValue: "60",
        }),
        expect.objectContaining({
          inputDefId: 303,
          status: "calculated",
          calculatedValue: "15",
        }),
      ]),
    );
  });

  it("cascades to top-level outputs when formula variable names contain spaces", async () => {
    mocks.buildSourceSnapshot.mockResolvedValue({
      capturedAt: "2026-01-01T00:00:00.000Z",
      scope: { reportPeriodId: 12 },
      values: {
        byVariable: {
          "Operating Expenses": "40",
          "Administrative Expenses": "5",
          "Operating Income": "70",
          "Other Income": "30",
        },
        byInputDefId: {
          401: "40",
          402: "5",
          403: "70",
          404: "30",
        },
      },
    });

    mocks.selectAggregatedFormulaTargets.mockResolvedValue([
      buildAggregatedTarget({
        inputDefId: 501,
        variableName: "Total Expenses",
        formula: "Operating Expenses + Administrative Expenses",
        formulaInputs: [
          { input_def_id: 401, variable_name: "Operating Expenses" },
          { input_def_id: 402, variable_name: "Administrative Expenses" },
        ],
      }),
      buildAggregatedTarget({
        inputDefId: 502,
        variableName: "Total Income",
        formula: "Operating Income + Other Income",
        formulaInputs: [
          { input_def_id: 403, variable_name: "Operating Income" },
          { input_def_id: 404, variable_name: "Other Income" },
        ],
      }),
      buildAggregatedTarget({
        inputDefId: 503,
        variableName: "Net Profit",
        formula: "Total Income - Total Expenses",
        formulaInputs: [
          { input_def_id: 502, variable_name: "Total Income" },
          { input_def_id: 501, variable_name: "Total Expenses" },
        ],
      }),
    ]);

    const { runAggregatedWorker } =
      await import("@/app/data-entry/enter-data/services/aggregated-worker/orchestrator");

    const result = await runAggregatedWorker({ id: "user-1" } as never, {
      reportPeriodId: 12,
    });

    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputDefId: 501,
          status: "calculated",
          calculatedValue: "45",
        }),
        expect.objectContaining({
          inputDefId: 502,
          status: "calculated",
          calculatedValue: "100",
        }),
        expect.objectContaining({
          inputDefId: 503,
          status: "calculated",
          calculatedValue: "55",
        }),
      ]),
    );
  });
});
