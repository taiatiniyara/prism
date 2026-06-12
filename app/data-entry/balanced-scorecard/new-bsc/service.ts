import type { CurrentUser } from "@/lib/user.service";
import { resolveUtilityScopeId } from "@/lib/user.service";

import {
  assertNewBscBuildAccess,
  assertNewBscReadAccess,
  assertNewBscTemplateAdminAccess,
  assertNewBscThemeAdminAccess,
  canEditBscTheme,
} from "./authz";
import {
  createTemplateNode,
  deleteTemplateNode,
  getThemeStyles,
  getUtilityScorecard,
  listBuilderKpiOptions,
  listKpiTargets,
  listReportTypeOptions,
  listTemplateTree,
  listTargetPlans,
  replacePerspectiveOverlay,
  saveKpiTargets,
  saveKpiTargetPlan,
  saveThemeStyles,
  setKpiTrajectory,
  updateTemplateNode,
} from "./repository";
import { sanitizeThemeStyles } from "./theme";
import type {
  BscThemeStyles,
  CreateTemplateNodePayload,
  KpiOption,
  KpiTargetRow,
  ReportTypeOption,
  SaveKpiTargetsPayload,
  TargetPlanSummary,
  ScorecardResponse,
  SavePerspectiveOverlayPayload,
  SetTrajectoryPayload,
  TemplateTreeResponse,
  ThemeResponse,
  UpdateTemplateNodePayload,
} from "./types";

const requireUtilityId = (user: CurrentUser): number => {
  const utilityId = resolveUtilityScopeId(user);
  if (utilityId == null) {
    throw new Error(
      "VALIDATION:Select a utility context to work on a scorecard.",
    );
  }
  return utilityId;
};

// --- Template (read for everyone with access; write for DEV/BMO) ------------

export const getTemplate = async (
  user: CurrentUser,
): Promise<TemplateTreeResponse> => {
  assertNewBscReadAccess(user);
  const nodes = await listTemplateTree();
  return { nodes };
};

export const addTemplateNode = async (
  user: CurrentUser,
  payload: CreateTemplateNodePayload,
) => {
  assertNewBscTemplateAdminAccess(user);
  return createTemplateNode(payload);
};

export const editTemplateNode = async (
  user: CurrentUser,
  id: string,
  payload: UpdateTemplateNodePayload,
) => {
  assertNewBscTemplateAdminAccess(user);
  await updateTemplateNode(id, payload);
};

export const removeTemplateNode = async (user: CurrentUser, id: string) => {
  assertNewBscTemplateAdminAccess(user);
  await deleteTemplateNode(id);
};

// --- Theme (read for all with access; write for DEV) ------------------------

export const getTheme = async (user: CurrentUser): Promise<ThemeResponse> => {
  assertNewBscReadAccess(user);
  const styles = await getThemeStyles();
  return { styles, canEdit: canEditBscTheme(user) };
};

export const saveTheme = async (
  user: CurrentUser,
  styles: BscThemeStyles,
): Promise<void> => {
  assertNewBscThemeAdminAccess(user);
  await saveThemeStyles(user.id, sanitizeThemeStyles(styles));
};

// --- Utility scorecard ------------------------------------------------------

export const getScorecard = async (
  user: CurrentUser,
): Promise<ScorecardResponse> => {
  assertNewBscReadAccess(user);
  const utilityId = requireUtilityId(user);
  return getUtilityScorecard(utilityId);
};

export const getKpiOptions = async (
  user: CurrentUser,
): Promise<KpiOption[]> => {
  assertNewBscReadAccess(user);
  const utilityId = requireUtilityId(user);
  return listBuilderKpiOptions(utilityId);
};

export const getReportTypeOptions = async (
  user: CurrentUser,
): Promise<ReportTypeOption[]> => {
  assertNewBscReadAccess(user);
  return listReportTypeOptions();
};

export const savePerspective = async (
  user: CurrentUser,
  payload: SavePerspectiveOverlayPayload,
) => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  await replacePerspectiveOverlay(utilityId, payload);
};

export const saveTrajectory = async (
  user: CurrentUser,
  payload: SetTrajectoryPayload,
) => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  await setKpiTrajectory(
    utilityId,
    user.id,
    payload.kpiDefinitionId,
    payload.trajectory,
  );
};

export const getKpiTargets = async (
  user: CurrentUser,
  kpiDefinitionId: number,
): Promise<KpiTargetRow[]> => {
  assertNewBscReadAccess(user);
  const utilityId = requireUtilityId(user);
  return listKpiTargets(utilityId, kpiDefinitionId);
};

export const saveKpiTargetsForBsc = async (
  user: CurrentUser,
  payload: SaveKpiTargetsPayload,
) => {
  assertNewBscBuildAccess(user);
  const utilityId = requireUtilityId(user);
  // Filled values write through to the shared KPI target store (scoring);
  // the full plan (incl. blanks) is kept for status reporting.
  await saveKpiTargets(utilityId, payload.kpiDefinitionId, payload.targets);
  if (payload.plan) {
    await saveKpiTargetPlan(
      utilityId,
      user.id,
      payload.kpiDefinitionId,
      payload.plan,
    );
  }
};

export const getTargetPlans = async (
  user: CurrentUser,
): Promise<TargetPlanSummary[]> => {
  assertNewBscReadAccess(user);
  const utilityId = requireUtilityId(user);
  return listTargetPlans(utilityId);
};
