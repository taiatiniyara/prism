import type {
  ScorecardDraftSavePayload,
  ScorecardFilterContext,
  ScorecardKpiOption,
  ScorecardRelationshipsUpdatePayload,
  ScorecardResponse,
  ScorecardUpdatePayload,
} from "@/app/data-entry/balanced-scorecard/types";

let latestRequestId = 0;

const toScorecardQueryString = (context: ScorecardFilterContext): string => {
  const params = new URLSearchParams();

  if (context.reportTypeId != null)
    params.set("reportTypeId", String(context.reportTypeId));
  if (context.serviceAreaId != null)
    params.set("serviceAreaId", String(context.serviceAreaId));
  if (context.kpiCategoryId != null)
    params.set("kpiCategoryId", String(context.kpiCategoryId));
  if (context.kpiSubcategoryId != null)
    params.set("kpiSubcategoryId", String(context.kpiSubcategoryId));

  return params.toString();
};

const toKpiOptionsQueryString = (context: ScorecardFilterContext): string => {
  const params = new URLSearchParams();
  params.set("reportPeriodId", String(context.reportPeriodId));

  if (context.reportTypeId != null)
    params.set("reportTypeId", String(context.reportTypeId));
  if (context.serviceAreaId != null)
    params.set("serviceAreaId", String(context.serviceAreaId));
  if (context.kpiCategoryId != null)
    params.set("kpiCategoryId", String(context.kpiCategoryId));
  if (context.kpiSubcategoryId != null)
    params.set("kpiSubcategoryId", String(context.kpiSubcategoryId));

  return params.toString();
};

export const fetchScorecard = async (
  context: ScorecardFilterContext,
): Promise<{ requestId: number; payload: ScorecardResponse }> => {
  const requestId = ++latestRequestId;
  const query = toScorecardQueryString(context);
  const response = await fetch(`/api/data-entry/balanced-scorecard?${query}`, {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json()) as
    | ScorecardResponse
    | { message: string };
  if (!response.ok) {
    const message =
      "message" in payload ? payload.message : "Unable to load scorecard.";
    throw new Error(message);
  }

  return { requestId, payload: payload as ScorecardResponse };
};

export const isLatestRequest = (requestId: number): boolean =>
  requestId === latestRequestId;

export const saveScorecardConfig = async (
  payload: ScorecardUpdatePayload,
): Promise<void> => {
  const response = await fetch(`/api/data-entry/balanced-scorecard`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(result.message ?? "Unable to update scorecard.");
  }
};

export const saveScorecardRelationships = async (
  payload: ScorecardRelationshipsUpdatePayload,
): Promise<void> => {
  const response = await fetch(
    `/api/data-entry/balanced-scorecard/relationships`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const result = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(
      result.message ?? "Unable to update scorecard relationships.",
    );
  }
};

export const saveScorecardDraft = async (
  payload: ScorecardDraftSavePayload,
): Promise<void> => {
  const response = await fetch(`/api/data-entry/balanced-scorecard/draft`, {
    method: "PUT",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(result.message ?? "Unable to save scorecard draft.");
  }
};

export const fetchScorecardKpiOptions = async (
  context: ScorecardFilterContext,
): Promise<ScorecardKpiOption[]> => {
  const query = toKpiOptionsQueryString(context);
  const response = await fetch(
    `/api/data-entry/balanced-scorecard/kpi-options?${query}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const result = (await response.json()) as {
    options?: ScorecardKpiOption[];
    message?: string;
  };

  if (!response.ok) {
    throw new Error(result.message ?? "Unable to load KPI options.");
  }

  return result.options ?? [];
};
