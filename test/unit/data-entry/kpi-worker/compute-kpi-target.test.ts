import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveFormulaInputValues: vi.fn(),
  upsertCalculatedKpiValue: vi.fn(),
}));

vi.mock("@/app/data-entry/kpi-worker/resolveInputs", () => ({
  resolveFormulaInputValues: mocks.resolveFormulaInputValues,
}));
vi.mock("@/app/data-entry/kpi-worker/persistKpi", () => ({
  upsertCalculatedKpiValue: mocks.upsertCalculatedKpiValue,
}));

import { computeKpiTarget } from "@/app/data-entry/kpi-worker/compute-kpi-target";
import type { ResolvedKpiTarget } from "@/app/data-entry/kpi-worker/resolveTargets";

const target = (formula: string): ResolvedKpiTarget => ({
  kpiDefId: 1,
  strataId: null,
  formula,
  formulaInputs: [],
  formulaVersion: "v1",
  targetValue: null,
});

const scope = { reportPeriodId: 10 };

/**
 * `computeKpiTarget` is the single step the triggered worker and the manual
 * recompute both run — this is where their behaviour is guaranteed identical.
 */
describe("computeKpiTarget", () => {
  beforeEach(() => {
    mocks.resolveFormulaInputValues.mockReset();
    mocks.upsertCalculatedKpiValue.mockReset().mockResolvedValue(undefined);
  });

  it("resolves, evaluates and persists → ok", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 2, b: 3 },
      missingVariables: [],
    });
    const outcome = await computeKpiTarget({ target: target("a + b"), scope });
    expect(outcome).toEqual({ status: "ok", value: "5", zeroFilled: [] });
    expect(mocks.upsertCalculatedKpiValue).toHaveBeenCalledWith(
      expect.objectContaining({ actualValue: "5", reportPeriodId: 10 }),
    );
  });

  it("zero-fills a missing input for a pure-addition formula", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 4 },
      missingVariables: ["b"],
    });
    const outcome = await computeKpiTarget({ target: target("a + b"), scope });
    expect(outcome).toEqual({ status: "ok", value: "4", zeroFilled: ["b"] });
  });

  it("does NOT zero-fill for a non-additive formula → missing-input", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 4 },
      missingVariables: ["b"],
    });
    const outcome = await computeKpiTarget({ target: target("a / b"), scope });
    expect(outcome).toMatchObject({
      status: "failed",
      failureType: "missing-input",
    });
    expect(mocks.upsertCalculatedKpiValue).not.toHaveBeenCalled();
  });

  it("classifies ALL-inputs-absent (non-additive) as not_applicable, not failed", async () => {
    // No input resolved to a value → the utility reported nothing this KPI
    // consumes (e.g. no transmission network), so it's out of scope, not a gap.
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: {},
      missingVariables: ["a", "b"],
    });
    const outcome = await computeKpiTarget({ target: target("a / b"), scope });
    expect(outcome.status).toBe("not_applicable");
    expect(mocks.upsertCalculatedKpiValue).not.toHaveBeenCalled();
  });

  it("keeps a PARTIAL gap (some inputs present) as a genuine missing-input failure", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 4 },
      missingVariables: ["b"],
    });
    const outcome = await computeKpiTarget({ target: target("a / b"), scope });
    expect(outcome).toMatchObject({
      status: "failed",
      failureType: "missing-input",
    });
  });

  it("maps an evaluation error", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 1, b: 0 },
      missingVariables: [],
    });
    const outcome = await computeKpiTarget({ target: target("a / b"), scope });
    expect(outcome).toMatchObject({
      status: "failed",
      failureType: "evaluation-error",
    });
  });

  it("classifies a transient persist failure as transient-infra", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 1 },
      missingVariables: [],
    });
    mocks.upsertCalculatedKpiValue.mockRejectedValue(
      new Error("deadlock detected"),
    );
    const outcome = await computeKpiTarget({ target: target("a"), scope });
    expect(outcome).toMatchObject({
      status: "failed",
      failureType: "transient-infra",
    });
  });

  it("notifies onRetry before a retry of the persist step", async () => {
    mocks.resolveFormulaInputValues.mockResolvedValue({
      variables: { a: 1 },
      missingVariables: [],
    });
    mocks.upsertCalculatedKpiValue
      .mockRejectedValueOnce(new Error("connection timeout"))
      .mockResolvedValueOnce(undefined);
    const onRetry = vi.fn();
    const outcome = await computeKpiTarget({
      target: target("a"),
      scope,
      onRetry,
    });
    expect(outcome.status).toBe("ok");
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});
