import { describe, expect, it } from "vitest";
import {
  parseCreateObjectiveLinkPayload,
  parseSetNodeMapDisplayPayload,
  parseUpdateObjectiveLinkPayload,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/strategy-map.validators";

describe("parseCreateObjectiveLinkPayload (spec §13.4)", () => {
  it("requires both endpoints", () => {
    expect(() => parseCreateObjectiveLinkPayload({ targetNodeId: "b" })).toThrow(
      /sourceNodeId must be a non-empty id/,
    );
    expect(() => parseCreateObjectiveLinkPayload({ sourceNodeId: "a" })).toThrow(
      /targetNodeId must be a non-empty id/,
    );
  });

  it("defaults relation to 'drives' when omitted or empty", () => {
    expect(
      parseCreateObjectiveLinkPayload({ sourceNodeId: "a", targetNodeId: "b" }).relation,
    ).toBe("drives");
    expect(
      parseCreateObjectiveLinkPayload({ sourceNodeId: "a", targetNodeId: "b", relation: "" })
        .relation,
    ).toBe("drives");
  });

  it.each(["drives", "enables", "constrains"])("accepts the reserved relation %s", (rel) => {
    expect(
      parseCreateObjectiveLinkPayload({ sourceNodeId: "a", targetNodeId: "b", relation: rel })
        .relation,
    ).toBe(rel);
  });

  it("rejects an unknown relation", () => {
    expect(() =>
      parseCreateObjectiveLinkPayload({
        sourceNodeId: "a",
        targetNodeId: "b",
        relation: "blocks",
      }),
    ).toThrow(/relation must be drives, enables, or constrains/);
  });

  it("trims a note and collapses blank to null", () => {
    expect(
      parseCreateObjectiveLinkPayload({ sourceNodeId: "a", targetNodeId: "b", note: "  hi  " })
        .note,
    ).toBe("hi");
    expect(
      parseCreateObjectiveLinkPayload({ sourceNodeId: "a", targetNodeId: "b", note: "   " }).note,
    ).toBeNull();
  });

  it("caps the note at 500 characters", () => {
    expect(() =>
      parseCreateObjectiveLinkPayload({
        sourceNodeId: "a",
        targetNodeId: "b",
        note: "x".repeat(501),
      }),
    ).toThrow(/500 characters or fewer/);
  });
});

describe("parseUpdateObjectiveLinkPayload", () => {
  it("returns only the provided fields", () => {
    expect(parseUpdateObjectiveLinkPayload({ note: "why" })).toEqual({ note: "why" });
    expect(parseUpdateObjectiveLinkPayload({})).toEqual({});
  });

  it("rejects a negative ord", () => {
    expect(() => parseUpdateObjectiveLinkPayload({ ord: -1 })).toThrow(
      /ord must be a non-negative integer/,
    );
  });

  it("rejects an invalid relation", () => {
    expect(() => parseUpdateObjectiveLinkPayload({ relation: "nope" })).toThrow(
      /relation must be/,
    );
  });
});

describe("parseSetNodeMapDisplayPayload (spec §13.2/§13.3)", () => {
  it("allows clearing overrides with null (inherit template / auto-layout)", () => {
    expect(
      parseSetNodeMapDisplayPayload({ mapLabel: null, isMapNode: null, mapX: null, mapY: null }),
    ).toEqual({ mapLabel: null, isMapNode: null, mapX: null, mapY: null });
  });

  it("trims a blank map label to null", () => {
    expect(parseSetNodeMapDisplayPayload({ mapLabel: "   " }).mapLabel).toBeNull();
  });

  it("caps the map label at 80 characters", () => {
    expect(() => parseSetNodeMapDisplayPayload({ mapLabel: "x".repeat(81) })).toThrow(
      /80 characters or fewer/,
    );
  });

  it("rejects a non-boolean isMapNode", () => {
    expect(() => parseSetNodeMapDisplayPayload({ isMapNode: "yes" })).toThrow(
      /isMapNode must be a boolean or null/,
    );
  });

  it("accepts integer drag positions and rejects fractional ones", () => {
    expect(parseSetNodeMapDisplayPayload({ mapX: 120, mapY: -40 })).toMatchObject({
      mapX: 120,
      mapY: -40,
    });
    expect(() => parseSetNodeMapDisplayPayload({ mapX: 1.5 })).toThrow(/mapX must be an integer/);
  });

  it("returns an empty object when nothing is provided", () => {
    expect(parseSetNodeMapDisplayPayload({})).toEqual({});
  });
});
