import { buildScorecardSnapshot } from "@/app/data-entry/balanced-scorecard/aggregator";
import {
  assertScorecardReadAccess,
  assertScorecardWriteAccess,
} from "@/app/data-entry/balanced-scorecard/authz";
import { sanitizeScorecardFilterContext } from "@/app/data-entry/balanced-scorecard/context";
import { toScorecardResponse } from "@/app/data-entry/balanced-scorecard/mapper";
import {
  listScorecardRelationships,
  listScorecardKpiOptions,
  listScorecardInputRows,
  upsertScorecardDraft,
  upsertScorecardConfiguration,
  upsertScorecardRelationships,
} from "@/app/data-entry/balanced-scorecard/repository";
import type {
  ScorecardDraftSavePayload,
  ScorecardFilterContext,
  ScorecardKpiOption,
  ScorecardRelationshipsUpdatePayload,
  ScorecardResponse,
  ScorecardUpdatePayload,
} from "@/app/data-entry/balanced-scorecard/types";
import type { CurrentUser } from "@/lib/user.service";

export const getScorecardResponse = async (
  user: CurrentUser,
  inputContext: ScorecardFilterContext,
): Promise<ScorecardResponse> => {
  assertScorecardReadAccess(user);
  const context = sanitizeScorecardFilterContext(inputContext);
  const rows = await listScorecardInputRows(context);
  const relationships = await listScorecardRelationships(context);
  const snapshot = buildScorecardSnapshot(rows);
  return toScorecardResponse(context, snapshot, rows, relationships);
};

export const getScorecardKpiOptions = async (
  user: CurrentUser,
  inputContext: ScorecardFilterContext,
): Promise<ScorecardKpiOption[]> => {
  assertScorecardReadAccess(user);
  const context = sanitizeScorecardFilterContext(inputContext);
  return listScorecardKpiOptions(context);
};

export const saveScorecardConfiguration = async (
  user: CurrentUser,
  payload: ScorecardUpdatePayload,
) => {
  assertScorecardWriteAccess(user);
  if (user.org_id == null) {
    throw new Error(
      "VALIDATION:Your account is not scoped to a utility for scorecard updates.",
    );
  }

  return upsertScorecardConfiguration(user.org_id, user.id, payload);
};

export const saveScorecardRelationships = async (
  user: CurrentUser,
  payload: ScorecardRelationshipsUpdatePayload,
) => {
  assertScorecardWriteAccess(user);
  if (user.org_id == null) {
    throw new Error(
      "VALIDATION:Your account is not scoped to a utility for scorecard updates.",
    );
  }

  return upsertScorecardRelationships(user.org_id, user.id, payload);
};

export const saveScorecardDraft = async (
  user: CurrentUser,
  payload: ScorecardDraftSavePayload,
) => {
  assertScorecardWriteAccess(user);
  if (user.org_id == null) {
    throw new Error(
      "VALIDATION:Your account is not scoped to a utility for scorecard updates.",
    );
  }

  return upsertScorecardDraft(user.org_id, user.id, payload);
};
