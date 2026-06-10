import type {
  CreateTemplateNodePayload,
  KpiOption,
  KpiTargetRow,
  SaveKpiTargetsPayload,
  ScorecardResponse,
  SavePerspectiveOverlayPayload,
  SetTrajectoryPayload,
  TemplateTreeResponse,
  UpdateTemplateNodePayload,
} from "./types";

const BASE = "/api/data-entry/balanced-scorecard/new-bsc";

const asJson = async <T>(response: Response, fallback: string): Promise<T> => {
  const payload = (await response.json()) as T | { message: string };
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? (payload as { message: string }).message
        : fallback;
    throw new Error(message);
  }
  return payload as T;
};

export const fetchTemplate = async (): Promise<TemplateTreeResponse> => {
  const response = await fetch(`${BASE}/template`, { cache: "no-store" });
  return asJson<TemplateTreeResponse>(response, "Unable to load BSC template.");
};

export const fetchScorecard = async (): Promise<ScorecardResponse> => {
  const response = await fetch(`${BASE}/scorecard`, { cache: "no-store" });
  return asJson<ScorecardResponse>(response, "Unable to load scorecard.");
};

export const fetchKpiOptions = async (): Promise<KpiOption[]> => {
  const response = await fetch(`${BASE}/kpi-options`, { cache: "no-store" });
  const data = await asJson<{ options: KpiOption[] }>(
    response,
    "Unable to load KPI options.",
  );
  return data.options;
};

export const savePerspectiveOverlay = async (
  payload: SavePerspectiveOverlayPayload,
): Promise<void> => {
  const response = await fetch(`${BASE}/scorecard`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await asJson<{ message: string }>(response, "Unable to save scorecard.");
};

export const saveTrajectory = async (
  payload: SetTrajectoryPayload,
): Promise<void> => {
  const response = await fetch(`${BASE}/trajectory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await asJson<{ message: string }>(response, "Unable to save trajectory.");
};

// --- Template admin (DEV/BMO) ----------------------------------------------

export const createTemplateNode = async (
  payload: CreateTemplateNodePayload,
): Promise<{ id: string }> => {
  const response = await fetch(`${BASE}/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await asJson<{ created: { id: string } }>(
    response,
    "Unable to create template node.",
  );
  return data.created;
};

export const updateTemplateNode = async (
  id: string,
  payload: UpdateTemplateNodePayload,
): Promise<void> => {
  const response = await fetch(`${BASE}/template/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await asJson<{ message: string }>(response, "Unable to update template node.");
};

export const deleteTemplateNode = async (id: string): Promise<void> => {
  const response = await fetch(`${BASE}/template/${id}`, { method: "DELETE" });
  await asJson<{ message: string }>(response, "Unable to delete template node.");
};

export const fetchKpiTargets = async (
  kpiDefinitionId: number,
): Promise<KpiTargetRow[]> => {
  const response = await fetch(
    `${BASE}/targets?kpiDefinitionId=${kpiDefinitionId}`,
    { cache: "no-store" },
  );
  const data = await asJson<{ targets: KpiTargetRow[] }>(
    response,
    "Unable to load KPI targets.",
  );
  return data.targets;
};

export const saveKpiTargets = async (
  payload: SaveKpiTargetsPayload,
): Promise<void> => {
  const response = await fetch(`${BASE}/targets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await asJson<{ message: string }>(response, "Unable to save KPI targets.");
};
