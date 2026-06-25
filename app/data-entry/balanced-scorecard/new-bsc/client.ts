import type {
  BscThemeStyles,
  CreateTemplateNodePayload,
  KpiOption,
  InputOption,
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

export const fetchInputOptions = async (): Promise<InputOption[]> => {
  const response = await fetch(`${BASE}/input-options`, { cache: "no-store" });
  const data = await asJson<{ options: InputOption[] }>(
    response,
    "Unable to load input options.",
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

export const fetchTheme = async (): Promise<ThemeResponse> => {
  const response = await fetch(`${BASE}/theme`, { cache: "no-store" });
  return asJson<ThemeResponse>(response, "Unable to load BSC theme.");
};

export const saveTheme = async (styles: BscThemeStyles): Promise<void> => {
  const response = await fetch(`${BASE}/theme`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ styles }),
  });
  await asJson<{ message: string }>(response, "Unable to save BSC theme.");
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

export const setTemplateNodeLinks = async (
  id: string,
  targetIds: string[],
): Promise<void> => {
  const response = await fetch(`${BASE}/template/${id}/links`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetIds }),
  });
  await asJson<{ message: string }>(response, "Unable to update master links.");
};

export const fetchTargetPlans = async (): Promise<
  Record<number, TargetPlanSummary>
> => {
  const response = await fetch(`${BASE}/target-plans`, { cache: "no-store" });
  const data = await asJson<{ plans: TargetPlanSummary[] }>(
    response,
    "Unable to load target plans.",
  );
  const map: Record<number, TargetPlanSummary> = {};
  for (const plan of data.plans) map[plan.kpiDefinitionId] = plan;
  return map;
};

export const fetchReportTypes = async (): Promise<ReportTypeOption[]> => {
  const response = await fetch(`${BASE}/report-types`, { cache: "no-store" });
  const data = await asJson<{ options: ReportTypeOption[] }>(
    response,
    "Unable to load tracking frequencies.",
  );
  return data.options;
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
