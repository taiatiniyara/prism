import type { BscTemplateLevel } from "@/db/schema/bsc-builder";
import type {
  CreateTemplateNodePayload,
  KpiLinkInput,
  KpiTargetRow,
  KpiTrajectory,
  InitiativeInput,
  OverlayNodeInput,
  SaveKpiTargetsPayload,
  SavePerspectiveOverlayPayload,
  SetTrajectoryPayload,
  SpecificObjectiveInput,
  UpdateTemplateNodePayload,
} from "@/app/data-entry/balanced-scorecard/new-bsc/types";

const LEVELS: BscTemplateLevel[] = [
  "perspective",
  "overall_objective",
  "key_focus_area",
  "strategic_objective",
  "strategic_lever",
];

const TRAJECTORIES: KpiTrajectory[] = ["increase", "decrease", "same"];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

const asLevel = (value: unknown, field: string): BscTemplateLevel => {
  if (typeof value !== "string" || !LEVELS.includes(value as BscTemplateLevel)) {
    throw new Error(`VALIDATION:${field} is not a valid BSC level.`);
  }
  return value as BscTemplateLevel;
};

const asTrimmed = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asOrd = (value: unknown): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

const asPositiveIntOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("VALIDATION:Expected a positive integer.");
  }
  return n;
};

const asUuidOrNull = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("VALIDATION:Expected a string id.");
  }
  return value;
};

const parseKpiLink = (raw: unknown, path: string): KpiLinkInput => {
  if (!isPlainObject(raw)) {
    throw new Error(`VALIDATION:${path} must be an object.`);
  }
  const kpiDefinitionId = asPositiveIntOrNull(raw.kpiDefinitionId);
  const pendingCustomKpiRequestId = asUuidOrNull(raw.pendingCustomKpiRequestId);
  if (kpiDefinitionId == null && pendingCustomKpiRequestId == null) {
    throw new Error(
      `VALIDATION:${path} requires kpiDefinitionId or pendingCustomKpiRequestId.`,
    );
  }
  return {
    kpiDefinitionId,
    pendingCustomKpiRequestId,
    ord: asOrd(raw.ord),
  };
};

const parseInitiative = (raw: unknown, path: string): InitiativeInput => {
  if (!isPlainObject(raw)) {
    throw new Error(`VALIDATION:${path} must be an object.`);
  }
  const title = asTrimmed(raw.title);
  if (title.length === 0) {
    throw new Error(`VALIDATION:${path}.title is required.`);
  }
  const kpisRaw = Array.isArray(raw.kpis) ? raw.kpis : [];
  return {
    title,
    description: asTrimmed(raw.description) || null,
    ord: asOrd(raw.ord),
    kpis: kpisRaw.map((k, i) => parseKpiLink(k, `${path}.kpis[${i}]`)),
  };
};

const parseSpecificObjective = (
  raw: unknown,
  path: string,
): SpecificObjectiveInput => {
  if (!isPlainObject(raw)) {
    throw new Error(`VALIDATION:${path} must be an object.`);
  }
  const description = asTrimmed(raw.description);
  if (description.length === 0) {
    throw new Error(`VALIDATION:${path}.description is required.`);
  }
  const initiativesRaw = Array.isArray(raw.initiatives) ? raw.initiatives : [];
  return {
    description,
    ord: asOrd(raw.ord),
    initiatives: initiativesRaw.map((ini, i) =>
      parseInitiative(ini, `${path}.initiatives[${i}]`),
    ),
  };
};

const parseOverlayNode = (raw: unknown, path: string): OverlayNodeInput => {
  if (!isPlainObject(raw)) {
    throw new Error(`VALIDATION:${path} must be an object.`);
  }
  const templateNodeId = asUuidOrNull(raw.templateNodeId);
  const label = asTrimmed(raw.label) || null;
  if (templateNodeId == null && label == null) {
    throw new Error(
      `VALIDATION:${path} requires templateNodeId or a custom label.`,
    );
  }
  const childrenRaw = Array.isArray(raw.children) ? raw.children : [];
  const objectivesRaw = Array.isArray(raw.specificObjectives)
    ? raw.specificObjectives
    : [];
  return {
    templateNodeId,
    label,
    level: asLevel(raw.level, `${path}.level`),
    ord: asOrd(raw.ord),
    children: childrenRaw.map((c, i) =>
      parseOverlayNode(c, `${path}.children[${i}]`),
    ),
    specificObjectives: objectivesRaw.map((o, i) =>
      parseSpecificObjective(o, `${path}.specificObjectives[${i}]`),
    ),
  };
};

export const parseSavePerspectiveOverlayPayload = (
  body: unknown,
): SavePerspectiveOverlayPayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const perspectiveTemplateNodeId = asUuidOrNull(body.perspectiveTemplateNodeId);
  if (perspectiveTemplateNodeId == null) {
    throw new Error("VALIDATION:perspectiveTemplateNodeId is required.");
  }
  const node = parseOverlayNode(body.node, "node");
  if (node.level !== "perspective") {
    throw new Error("VALIDATION:node must be a perspective root.");
  }
  return { perspectiveTemplateNodeId, node };
};

export const parseSetTrajectoryPayload = (
  body: unknown,
): SetTrajectoryPayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const kpiDefinitionId = asPositiveIntOrNull(body.kpiDefinitionId);
  if (kpiDefinitionId == null) {
    throw new Error("VALIDATION:kpiDefinitionId must be a positive integer.");
  }
  let trajectory: KpiTrajectory | null = null;
  if (body.trajectory != null && body.trajectory !== "") {
    if (
      typeof body.trajectory !== "string" ||
      !TRAJECTORIES.includes(body.trajectory as KpiTrajectory)
    ) {
      throw new Error(
        "VALIDATION:trajectory must be increase, decrease, same, or null.",
      );
    }
    trajectory = body.trajectory as KpiTrajectory;
  }
  return { kpiDefinitionId, trajectory };
};

export const parseSaveKpiTargetsPayload = (
  body: unknown,
): SaveKpiTargetsPayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const kpiDefinitionId = asPositiveIntOrNull(body.kpiDefinitionId);
  if (kpiDefinitionId == null) {
    throw new Error("VALIDATION:kpiDefinitionId must be a positive integer.");
  }
  const rows = Array.isArray(body.targets) ? body.targets : [];
  const targets: KpiTargetRow[] = rows.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new Error(`VALIDATION:targets[${index}] must be an object.`);
    }
    const year = Number(raw.year);
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      throw new Error(`VALIDATION:targets[${index}].year must be a valid year.`);
    }
    let month: number | null = null;
    if (raw.month != null && raw.month !== "" && raw.month !== "fy") {
      month = Number(raw.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(
          `VALIDATION:targets[${index}].month must be 1-12 or null.`,
        );
      }
    }
    const targetValue = asTrimmed(raw.targetValue);
    if (targetValue.length === 0) {
      throw new Error(`VALIDATION:targets[${index}].targetValue is required.`);
    }
    return { year, month, targetValue };
  });
  return { kpiDefinitionId, targets };
};

export const parseCreateTemplateNodePayload = (
  body: unknown,
): CreateTemplateNodePayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const label = asTrimmed(body.label);
  if (label.length === 0) {
    throw new Error("VALIDATION:label is required.");
  }
  return {
    parentId: asUuidOrNull(body.parentId),
    level: asLevel(body.level, "level"),
    label,
    isMandatory: body.isMandatory === true,
    ord: asOrd(body.ord),
  };
};

export const parseUpdateTemplateNodePayload = (
  body: unknown,
): UpdateTemplateNodePayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const payload: UpdateTemplateNodePayload = {};
  if (body.label !== undefined) {
    const label = asTrimmed(body.label);
    if (label.length === 0) {
      throw new Error("VALIDATION:label cannot be empty.");
    }
    payload.label = label;
  }
  if (body.isMandatory !== undefined) {
    payload.isMandatory = body.isMandatory === true;
  }
  if (body.ord !== undefined) {
    payload.ord = asOrd(body.ord);
  }
  if (body.isActive !== undefined) {
    payload.isActive = body.isActive === true;
  }
  return payload;
};
