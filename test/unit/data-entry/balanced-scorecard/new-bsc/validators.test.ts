import { describe, expect, it } from "vitest";
import {
  parseCreateTemplateNodePayload,
  parseSaveKpiTargetsPayload,
  parseSavePerspectiveOverlayPayload,
  parseSetTrajectoryPayload,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";

// The inner node/objective/initiative/kpi parsers aren't exported; they're
// exercised through a full perspective-overlay payload. This helper nests an
// arbitrary specific-objective tree directly under the perspective root (the
// validator doesn't enforce which level SOs hang under — that's a UI concern).
const overlay = (specificObjectives: unknown[]) => ({
  perspectiveTemplateNodeId: "p-1",
  node: {
    templateNodeId: "p-1",
    level: "perspective",
    ord: 0,
    children: [],
    specificObjectives,
  },
});

const kpiLink = { kpiDefinitionId: 42, ord: 0 };

describe("parseSavePerspectiveOverlayPayload (spec §3)", () => {
  it("rejects a non-object body", () => {
    expect(() => parseSavePerspectiveOverlayPayload(null)).toThrow(/VALIDATION:/);
  });

  it("requires the perspective template node id", () => {
    expect(() =>
      parseSavePerspectiveOverlayPayload({
        node: { templateNodeId: "p-1", level: "perspective" },
      }),
    ).toThrow(/perspectiveTemplateNodeId is required/);
  });

  it("rejects a root node that is not a perspective", () => {
    expect(() =>
      parseSavePerspectiveOverlayPayload({
        perspectiveTemplateNodeId: "p-1",
        node: { templateNodeId: "p-1", level: "strategic_lever" },
      }),
    ).toThrow(/must be a perspective root/);
  });

  it("requires templateNodeId or a custom label on every overlay node", () => {
    expect(() =>
      parseSavePerspectiveOverlayPayload({
        perspectiveTemplateNodeId: "p-1",
        node: { level: "perspective" }, // neither templateNodeId nor label
      }),
    ).toThrow(/requires templateNodeId or a custom label/);
  });

  it("accepts a custom node identified by label alone (spec §4)", () => {
    const parsed = parseSavePerspectiveOverlayPayload({
      perspectiveTemplateNodeId: "p-1",
      node: {
        templateNodeId: "p-1",
        level: "perspective",
        children: [{ label: "Custom focus area", level: "key_focus_area" }],
        specificObjectives: [],
      },
    });
    expect(parsed.node.children[0]?.templateNodeId).toBeNull();
    expect(parsed.node.children[0]?.label).toBe("Custom focus area");
  });
});

describe("specific objective + KPI rules (spec §3)", () => {
  it("requires a specific-objective description", () => {
    expect(() => parseSavePerspectiveOverlayPayload(overlay([{ description: "" }]))).toThrow(
      /description is required/,
    );
  });

  it("requires a KPI link to carry a definition id, input id, or a pending custom id", () => {
    const payload = overlay([
      {
        description: "Improve reliability",
        initiatives: [{ title: "Cut SAIDI", kpis: [{ ord: 0 }] }],
      },
    ]);
    expect(() => parseSavePerspectiveOverlayPayload(payload)).toThrow(
      /requires kpiDefinitionId, inputDefinitionId or pendingCustomKpiRequestId/,
    );
  });
});

describe("initiative vs project discriminator (spec §3a)", () => {
  it("defaults kind to initiative and strips project-only fields", () => {
    const payload = overlay([
      {
        description: "Improve reliability",
        initiatives: [
          {
            title: "Ongoing maintenance",
            // No kind => initiative. Project fields must NOT survive.
            startDate: "2026-01-01",
            targetCompletionDate: "2026-12-31",
            status: "in_progress",
            kpis: [kpiLink],
          },
        ],
      },
    ]);
    const ini = parseSavePerspectiveOverlayPayload(payload).node.specificObjectives[0]
      ?.initiatives[0];
    expect(ini?.kind).toBe("initiative");
    expect(ini?.startDate).toBeNull();
    expect(ini?.targetCompletionDate).toBeNull();
    expect(ini?.status).toBeNull();
  });

  it("keeps strategic fields on a project", () => {
    const payload = overlay([
      {
        description: "Roll out AMI",
        initiatives: [
          {
            title: "AMI deployment",
            kind: "project",
            startDate: "2026-02-01",
            targetCompletionDate: "2026-11-30",
            status: "planned",
            kpis: [kpiLink],
          },
        ],
      },
    ]);
    const proj = parseSavePerspectiveOverlayPayload(payload).node.specificObjectives[0]
      ?.initiatives[0];
    expect(proj?.kind).toBe("project");
    expect(proj?.startDate).toBe("2026-02-01");
    expect(proj?.status).toBe("planned");
  });

  it("rejects an invalid project status", () => {
    const payload = overlay([
      {
        description: "Roll out AMI",
        initiatives: [
          { title: "AMI", kind: "project", status: "halfway", kpis: [kpiLink] },
        ],
      },
    ]);
    expect(() => parseSavePerspectiveOverlayPayload(payload)).toThrow(/status is invalid/);
  });

  it("rejects a malformed project date", () => {
    const payload = overlay([
      {
        description: "Roll out AMI",
        initiatives: [
          { title: "AMI", kind: "project", startDate: "Feb 2026", kpis: [kpiLink] },
        ],
      },
    ]);
    expect(() => parseSavePerspectiveOverlayPayload(payload)).toThrow(
      /startDate must be a YYYY-MM-DD date/,
    );
  });

  it("requires an initiative title", () => {
    const payload = overlay([
      { description: "x", initiatives: [{ title: "  ", kpis: [kpiLink] }] },
    ]);
    expect(() => parseSavePerspectiveOverlayPayload(payload)).toThrow(/title is required/);
  });
});

describe("parseSetTrajectoryPayload (spec §5)", () => {
  it.each(["increase", "decrease", "same"])("accepts %s", (t) => {
    expect(parseSetTrajectoryPayload({ kpiDefinitionId: 7, trajectory: t }).trajectory).toBe(t);
  });

  it("treats empty/absent trajectory as null (clear)", () => {
    expect(parseSetTrajectoryPayload({ kpiDefinitionId: 7 }).trajectory).toBeNull();
    expect(parseSetTrajectoryPayload({ kpiDefinitionId: 7, trajectory: "" }).trajectory).toBeNull();
  });

  it("rejects an unknown trajectory", () => {
    expect(() => parseSetTrajectoryPayload({ kpiDefinitionId: 7, trajectory: "up" })).toThrow(
      /trajectory must be/,
    );
  });

  it("requires a positive KPI definition id", () => {
    expect(() => parseSetTrajectoryPayload({ kpiDefinitionId: 0 })).toThrow(/positive integer/);
    expect(() => parseSetTrajectoryPayload({})).toThrow(
      /kpiDefinitionId must be a positive integer/,
    );
  });
});

describe("parseSaveKpiTargetsPayload (spec §5)", () => {
  it("accepts year-only and year+month rows", () => {
    const parsed = parseSaveKpiTargetsPayload({
      kpiDefinitionId: 7,
      targets: [
        { year: 2026, targetValue: "95" },
        { year: 2026, month: 6, targetValue: "92" },
        { year: 2027, month: "fy", targetValue: "97" }, // "fy" collapses to year-only
      ],
    });
    expect(parsed.targets).toHaveLength(3);
    expect(parsed.targets[0]?.month).toBeNull();
    expect(parsed.targets[1]?.month).toBe(6);
    expect(parsed.targets[2]?.month).toBeNull();
  });

  it("rejects an out-of-range month", () => {
    expect(() =>
      parseSaveKpiTargetsPayload({
        kpiDefinitionId: 7,
        targets: [{ year: 2026, month: 13, targetValue: "1" }],
      }),
    ).toThrow(/month must be 1-12/);
  });

  it("rejects an implausible year", () => {
    expect(() =>
      parseSaveKpiTargetsPayload({
        kpiDefinitionId: 7,
        targets: [{ year: 1700, targetValue: "1" }],
      }),
    ).toThrow(/year must be a valid year/);
  });

  it("requires a target value", () => {
    expect(() =>
      parseSaveKpiTargetsPayload({
        kpiDefinitionId: 7,
        targets: [{ year: 2026, targetValue: "  " }],
      }),
    ).toThrow(/targetValue is required/);
  });
});

describe("parseCreateTemplateNodePayload (spec §10)", () => {
  it("creates a node with a valid level and label", () => {
    const parsed = parseCreateTemplateNodePayload({
      parentId: "n-1",
      level: "key_focus_area",
      label: "Reliability",
      isMandatory: true,
      ord: 2,
    });
    expect(parsed).toMatchObject({
      parentId: "n-1",
      level: "key_focus_area",
      label: "Reliability",
      isMandatory: true,
      ord: 2,
    });
  });

  it("requires a label", () => {
    expect(() =>
      parseCreateTemplateNodePayload({ level: "key_focus_area", label: "   " }),
    ).toThrow(/label is required/);
  });

  it("caps the label at 32 characters", () => {
    expect(() =>
      parseCreateTemplateNodePayload({
        level: "key_focus_area",
        label: "x".repeat(33),
      }),
    ).toThrow(/32 characters or fewer/);
  });

  it("rejects an invalid level", () => {
    expect(() =>
      parseCreateTemplateNodePayload({ level: "specific_objective", label: "x" }),
    ).toThrow(/not a valid BSC level/);
  });

  it("defaults isMandatory to false when omitted", () => {
    expect(
      parseCreateTemplateNodePayload({ level: "strategic_lever", label: "x" }).isMandatory,
    ).toBe(false);
  });
});
