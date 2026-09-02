import { describe, expect, it } from "vitest";

import {
  resolveComputeOrder,
  wouldCreateCycle,
} from "@/app/data-entry/enter-data/services/aggregated-worker/compute-order";

describe("resolveComputeOrder", () => {
  it("returns an acyclic set unchanged (stable by id) when there are no edges", () => {
    const result = resolveComputeOrder([
      { id: 3, inputIds: [] },
      { id: 1, inputIds: [] },
      { id: 2, inputIds: [] },
    ]);
    expect(result).toEqual({ order: [1, 2, 3], cyclic: [] });
  });

  it("puts a dependency before the node that reads it", () => {
    // 20 = Total Income (computed), 30 = Profit reads 20
    const result = resolveComputeOrder([
      { id: 30, inputIds: [20, 999] }, // 999 is a raw measure — no edge
      { id: 20, inputIds: [101, 102] }, // raw inputs — no edges
    ]);
    expect(result).toEqual({ order: [20, 30], cyclic: [] });
  });

  it("orders a multi-level chain deps-first", () => {
    const result = resolveComputeOrder([
      { id: 1, inputIds: [] },
      { id: 2, inputIds: [1] },
      { id: 3, inputIds: [2] },
      { id: 4, inputIds: [2, 3] },
    ]);
    expect(result.cyclic).toEqual([]);
    // 1 before 2, 2 before 3, {2,3} before 4
    const pos = (n: number) => result.order.indexOf(n);
    expect(pos(1)).toBeLessThan(pos(2));
    expect(pos(2)).toBeLessThan(pos(3));
    expect(pos(3)).toBeLessThan(pos(4));
  });

  it("ignores edges to ids that aren't computed nodes in the set", () => {
    const result = resolveComputeOrder([{ id: 5, inputIds: [1, 2, 3] }]);
    expect(result).toEqual({ order: [5], cyclic: [] });
  });

  it("ignores a self-reference rather than reporting a cycle", () => {
    const result = resolveComputeOrder([{ id: 7, inputIds: [7] }]);
    expect(result).toEqual({ order: [7], cyclic: [] });
  });

  it("reports a 2-node cycle as cyclic and orders nothing in it", () => {
    const result = resolveComputeOrder([
      { id: 1, inputIds: [2] },
      { id: 2, inputIds: [1] },
    ]);
    expect(result.order).toEqual([]);
    expect(result.cyclic).toEqual([1, 2]);
  });

  it("orders the acyclic part and flags the cycle + its downstream", () => {
    const result = resolveComputeOrder([
      { id: 1, inputIds: [] }, // clean
      { id: 2, inputIds: [3] }, // cycle
      { id: 3, inputIds: [2] }, // cycle
      { id: 4, inputIds: [2] }, // downstream of the cycle
    ]);
    expect(result.order).toEqual([1]);
    expect(result.cyclic).toEqual([2, 3, 4]);
  });
});

describe("wouldCreateCycle", () => {
  const others = [
    { id: 20, inputIds: [101] }, // Total Costs ← raw inputs
    { id: 30, inputIds: [20, 102] }, // Profit ← Total Costs
  ];

  it("false when the new edit only reads raw measures", () => {
    expect(wouldCreateCycle(20, [101, 102], others)).toBe(false);
  });

  it("false when it reads another calculated measure acyclically", () => {
    // a new measure 40 that reads Profit — fine
    expect(wouldCreateCycle(40, [30], others)).toBe(false);
  });

  it("true when the edit makes Total Costs read Profit (which reads it)", () => {
    expect(wouldCreateCycle(20, [30], others)).toBe(true);
  });

  it("true for a direct self-cycle via a chain", () => {
    expect(
      wouldCreateCycle(1, [2], [
        { id: 2, inputIds: [3] },
        { id: 3, inputIds: [1] },
      ]),
    ).toBe(true);
  });
});
