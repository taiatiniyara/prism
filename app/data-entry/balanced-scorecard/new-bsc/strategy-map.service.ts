import type { CurrentUser } from "@/lib/user.service";
import { resolveUtilityScopeId } from "@/lib/user.service";

import { assertNewBscBuildAccess, assertNewBscReadAccess } from "./authz";
import {
  createObjectiveLink,
  deleteObjectiveLink,
  getStrategyMap as getStrategyMapFromDb,
  setNodeMapDisplay as setNodeMapDisplayInDb,
  updateObjectiveLink,
} from "./strategy-map.repository";
import type {
  CreateObjectiveLinkInput,
  CreateObjectiveLinkResult,
  SetNodeMapDisplayInput,
  StrategyMapResponse,
  UpdateObjectiveLinkInput,
} from "./strategy-map.types";

const requireUtilityId = (user: CurrentUser): number => {
  const utilityId = resolveUtilityScopeId(user);
  if (utilityId == null) {
    throw new Error(
      "VALIDATION:Select a utility context to work on a scorecard.",
    );
  }
  return utilityId;
};

export const getStrategyMap = async (
  user: CurrentUser,
): Promise<StrategyMapResponse> => {
  assertNewBscReadAccess(user);
  const utilityId = requireUtilityId(user);
  return getStrategyMapFromDb(utilityId);
};

export const addObjectiveLink = async (
  user: CurrentUser,
  input: CreateObjectiveLinkInput,
): Promise<CreateObjectiveLinkResult> => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  return createObjectiveLink(utilityId, input);
};

export const editObjectiveLink = async (
  user: CurrentUser,
  id: string,
  input: UpdateObjectiveLinkInput,
): Promise<void> => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  await updateObjectiveLink(utilityId, id, input);
};

export const removeObjectiveLink = async (
  user: CurrentUser,
  id: string,
): Promise<void> => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  await deleteObjectiveLink(utilityId, id);
};

export const setNodeMapDisplay = async (
  user: CurrentUser,
  nodeId: string,
  input: SetNodeMapDisplayInput,
): Promise<void> => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  await setNodeMapDisplayInDb(utilityId, nodeId, input);
};
