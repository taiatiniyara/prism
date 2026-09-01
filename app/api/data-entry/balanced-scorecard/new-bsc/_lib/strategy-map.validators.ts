import type { BscLinkRelation } from "@/db/schema/bsc-builder";
import type {
  CreateObjectiveLinkInput,
  SetNodeMapDisplayInput,
  UpdateObjectiveLinkInput,
} from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.types";

const RELATIONS: BscLinkRelation[] = ["drives", "enables", "constrains"];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

const asUuid = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`VALIDATION:${field} must be a non-empty id.`);
  }
  return value;
};

const asRelation = (value: unknown): BscLinkRelation => {
  if (value == null || value === "") return "drives";
  if (typeof value !== "string" || !RELATIONS.includes(value as BscLinkRelation)) {
    throw new Error(
      "VALIDATION:relation must be drives, enables, or constrains.",
    );
  }
  return value as BscLinkRelation;
};

// Trimmed text or null; rejects oversized notes.
const asNoteOrNull = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("VALIDATION:note must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 500) {
    throw new Error("VALIDATION:note must be 500 characters or fewer.");
  }
  return trimmed;
};

const asIntOrNull = (value: unknown, field: string): number | null => {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`VALIDATION:${field} must be an integer.`);
  }
  return n;
};

export const parseCreateObjectiveLinkPayload = (
  body: unknown,
): CreateObjectiveLinkInput => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  return {
    sourceNodeId: asUuid(body.sourceNodeId, "sourceNodeId"),
    targetNodeId: asUuid(body.targetNodeId, "targetNodeId"),
    relation: asRelation(body.relation),
    note: asNoteOrNull(body.note),
  };
};

export const parseUpdateObjectiveLinkPayload = (
  body: unknown,
): UpdateObjectiveLinkInput => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const out: UpdateObjectiveLinkInput = {};
  if (body.relation !== undefined) out.relation = asRelation(body.relation);
  if (body.note !== undefined) out.note = asNoteOrNull(body.note);
  if (body.ord !== undefined) {
    const ord = asIntOrNull(body.ord, "ord");
    if (ord == null || ord < 0) {
      throw new Error("VALIDATION:ord must be a non-negative integer.");
    }
    out.ord = ord;
  }
  return out;
};

export const parseSetNodeMapDisplayPayload = (
  body: unknown,
): SetNodeMapDisplayInput => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }
  const out: SetNodeMapDisplayInput = {};
  if (body.mapLabel !== undefined) {
    if (body.mapLabel === null) {
      out.mapLabel = null;
    } else if (typeof body.mapLabel === "string") {
      const trimmed = body.mapLabel.trim();
      if (trimmed.length > 80) {
        throw new Error("VALIDATION:mapLabel must be 80 characters or fewer.");
      }
      out.mapLabel = trimmed.length === 0 ? null : trimmed;
    } else {
      throw new Error("VALIDATION:mapLabel must be a string or null.");
    }
  }
  if (body.isMapNode !== undefined) {
    if (body.isMapNode !== null && typeof body.isMapNode !== "boolean") {
      throw new Error("VALIDATION:isMapNode must be a boolean or null.");
    }
    out.isMapNode = body.isMapNode as boolean | null;
  }
  if (body.mapX !== undefined) out.mapX = asIntOrNull(body.mapX, "mapX");
  if (body.mapY !== undefined) out.mapY = asIntOrNull(body.mapY, "mapY");
  return out;
};
