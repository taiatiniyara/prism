import type {
  CreateObjectiveLinkInput,
  CreateObjectiveLinkResult,
  SetNodeMapDisplayInput,
  StrategyMapResponse,
  UpdateObjectiveLinkInput,
} from "./strategy-map.types";

const BASE = "/api/data-entry/balanced-scorecard/new-bsc/strategy-map";

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

export const fetchStrategyMap = async (): Promise<StrategyMapResponse> => {
  const response = await fetch(BASE, { cache: "no-store" });
  return asJson<StrategyMapResponse>(response, "Unable to load strategy map.");
};

export const createObjectiveLink = async (
  input: CreateObjectiveLinkInput,
): Promise<CreateObjectiveLinkResult> => {
  const response = await fetch(`${BASE}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return asJson<CreateObjectiveLinkResult>(response, "Unable to create link.");
};

export const updateObjectiveLink = async (
  id: string,
  input: UpdateObjectiveLinkInput,
): Promise<void> => {
  const response = await fetch(`${BASE}/links/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await asJson<{ message: string }>(response, "Unable to update link.");
};

export const deleteObjectiveLink = async (id: string): Promise<void> => {
  const response = await fetch(`${BASE}/links/${id}`, { method: "DELETE" });
  await asJson<{ message: string }>(response, "Unable to delete link.");
};

export const setNodeMapDisplay = async (
  nodeId: string,
  input: SetNodeMapDisplayInput,
): Promise<void> => {
  const response = await fetch(`${BASE}/nodes/${nodeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await asJson<{ message: string }>(response, "Unable to update map node.");
};
