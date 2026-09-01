import { describe, expect, it } from "vitest";
import { closesCycle } from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.repository";

// `closesCycle(existing, source, target)` answers: would adding source->target
// close a cause-effect cycle? (spec §13.4 — such a link is warned about but
// still allowed). It does iff `target` can already reach `source`.
const edge = (source_node_id: string, target_node_id: string) => ({
  source_node_id,
  target_node_id,
});

describe("closesCycle (spec §13.4 cycle-warn)", () => {
  it("is false when there are no existing edges", () => {
    expect(closesCycle([], "a", "b")).toBe(false);
  });

  it("detects the simplest two-node cycle (a->b, then b->a)", () => {
    expect(closesCycle([edge("a", "b")], "b", "a")).toBe(true);
  });

  it("detects a longer back-edge cycle (a->b->c, then c->a)", () => {
    expect(closesCycle([edge("a", "b"), edge("b", "c")], "c", "a")).toBe(true);
  });

  it("does not flag a forward shortcut that keeps the graph acyclic (a->b->c, then a->c)", () => {
    expect(closesCycle([edge("a", "b"), edge("b", "c")], "a", "c")).toBe(false);
  });

  it("does not flag a link between disconnected components", () => {
    expect(closesCycle([edge("a", "b"), edge("c", "d")], "d", "a")).toBe(false);
  });

  it("terminates on a graph that already contains a cycle", () => {
    // Pre-existing a<->b loop; adding b->c must not hang and is not itself a cycle.
    expect(closesCycle([edge("a", "b"), edge("b", "a")], "b", "c")).toBe(false);
  });
});
