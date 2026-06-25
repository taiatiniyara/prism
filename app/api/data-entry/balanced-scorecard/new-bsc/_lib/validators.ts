import type { BscTemplateLevel } from "@/db/schema/bsc-builder";
import type {
  BscActivityKind,
  BscProjectStatus,
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

// Master template node labels are capped (matches the editor's input maxLength).
const TEMPLATE_LABEL_MAX = 32;

const LEVELS: BscTemplateLevel[] = [
  "perspective",
  "overall_objective",
  "key_focus_area",
  "strategic_objective",
  "strategic_lever",
];

const TRAJECTORIES: KpiTrajectory[] = ["increase", "decrease", "same"];

const PROJECT_STATUSES: BscProjectStatus[] = [
  "planned",
  "in_progress",
  "complete",
  "on_hold",
];

// Accept an ISO date string (YYYY-MM-DD) or null.
const asDateOrNull = (value: unknown, field: string): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error(`VALIDATION:${field} must be a YYYY-MM-DD date.`);
  }
  return value.trim();
};

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
  const inputDefinitionId = asPositiveIntOrNull(raw.inputDefinitionId);
  const pendingCustomKpiRequestId = asUuidOrNull(raw.pendingCustomKpiRequestId);
  if (
    kpiDefinitionId == null &&
    inputDefinitionId == null &&
    pendingCustomKpiRequestId == null
  ) {
    throw new Error(
      `VALIDATION:${path} requires kpiDefinitionId, inputDefinitionId or pendingCustomKpiRequestId.`,
    );
  }
  return {
    kpiDefinitionId,
    inputDefinitionId,
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
  const kind: BscActivityKind = raw.kind === "project" ? "project" : "initiative";

  let status: BscProjectStatus | null = null;
  if (raw.status != null && raw.status !== "") {
    if (
      typeof raw.status !== "string" ||
      !PROJECT_STATUSES.includes(raw.status as BscProjectStatus)
    ) {
      throw new Error(`VALIDATION:${path}.status is invalid.`);
    }
    status = raw.status as BscProjectStatus;
  }

  const kpisRaw = Array.isArray(raw.kpis) ? raw.kpis : [];
  return {
    title,
    description: asTrimmed(raw.description) || null,
    kind,
    // Project fields only apply to projects.
    startDate: kind === "project" ? asDateOrNull(raw.startDate, `${path}.startDate`) : null,
    targetCompletionDate:
      kind === "project"
        ? asDateOrNull(raw.targetCompletionDate, `${path}.targetCompletionDate`)
        : null,
    status: kind === "project" ? status : null,
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

  let plan: SaveKpiTargetsPayload["plan"] = null;
  if (isPlainObject(body.plan)) {
    const planBody = body.plan;
    const periodsRaw = Array.isArray(planBody.periods) ? planBody.periods : [];
    plan = {
      frequency: asTrimmed(planBody.frequency),
      startDate: asDateOrNull(planBody.startDate, "plan.startDate") ?? "",
      periods: periodsRaw.map((raw, index) => {
        if (!isPlainObject(raw)) {
          throw new Error(`VALIDATION:plan.periods[${index}] must be an object.`);
        }
        const year = Number(raw.year);
        if (!Number.isInteger(year)) {
          throw new Error(`VALIDATION:plan.periods[${index}].year invalid.`);
        }
        const month =
          raw.month == null || raw.month === "" ? null : Number(raw.month);
        if (
          month != null &&
          (!Number.isInteger(month) || month < 1 || month > 12)
        ) {
          throw new Error(`VALIDATION:plan.periods[${index}].month invalid.`);
        }
        return {
          label: asTrimmed(raw.label),
          year,
          month,
          value: asTrimmed(raw.value),
        };
      }),
    };
  }

  return { kpiDefinitionId, targets, plan };
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
  if (label.length > TEMPLATE_LABEL_MAX) {
    throw new Error(
      `VALIDATION:label must be ${TEMPLATE_LABEL_MAX} characters or fewer.`,
    );
  }
  return {
    parentId: asUuidOrNull(body.parentId),
    level: asLevel(body.level, "level"),
    label,
    isMandatory: body.isMandatory === true,
    ord: asOrd(body.ord),
  };
};

// The service sanitizes styles (drops unknown keys / invalid values), so this
// only needs to surface the raw styles object.
export const parseSaveThemePayload = (body: unknown): { styles: unknown } => {
  if (!isPlainObject(body) || !isPlainObject(body.styles)) {
    throw new Error("VALIDATION:styles must be an object.");
  }
  return { styles: body.styles };
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
    if (label.length > TEMPLATE_LABEL_MAX) {
      throw new Error(
        `VALIDATION:label must be ${TEMPLATE_LABEL_MAX} characters or fewer.`,
      );
    }
    payload.label = label;
  }
  if (body.isMandatory !== undefined) {
    payload.isMandatory = body.isMandatory === true;
  }
  if (body.isMapNode !== undefined) {
    payload.isMapNode = body.isMapNode === true;
  }
  if (body.ord !== undefined) {
    payload.ord = asOrd(body.ord);
  }
  if (body.isActive !== undefined) {
    payload.isActive = body.isActive === true;
  }
  return payload;
};

export const parseSetTemplateNodeLinksPayload = (
  body: unknown,
): { targetIds: string[] } => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  if (!Array.isArray(body.targetIds)) {
    throw new Error("VALIDATION:targetIds must be an array.");
  }
  const targetIds = body.targetIds.map((t) => {
    if (typeof t !== "string" || t.trim().length === 0) {
      throw new Error("VALIDATION:Each target id must be a non-empty string.");
    }
    return t;
  });
  return { targetIds };
};
