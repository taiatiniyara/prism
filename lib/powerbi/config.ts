import { logger } from "@/lib/logging/logger";
import { getAuthConfig, getAzureTokenRaw, fetchWithRetry, clearTokenCache, type PowerBiConfig } from "./auth";

async function resolveWorkspaceByName(name: string, bearerToken: string): Promise<string | undefined> {
  if (name.toLowerCase() === "my workspace") {
    const resp = await fetchWithRetry("https://api.powerbi.com/v1.0/myorg/groups", {
      headers: { Authorization: bearerToken },
    });
    if (resp.ok) {
      const data = await resp.json();
      const match = (data.value ?? []).find(
        (w: { id: string; name: string }) => w.name.toLowerCase() === "my workspace"
      );
      if (match) return match.id;
    }
    return "me";
  }

  const resp = await fetchWithRetry("https://api.powerbi.com/v1.0/myorg/groups", {
    headers: { Authorization: bearerToken },
  });
  if (!resp.ok) {
    logger.warn("[powerbi] Failed to resolve workspace by name", { name, status: resp.status });
    return undefined;
  }
  const data = await resp.json();
  const match = (data.value ?? []).find(
    (w: { id: string; name: string }) => w.name.toLowerCase() === name.toLowerCase()
  );
  if (!match) {
    logger.warn("[powerbi] Workspace name not found", { name, available: (data.value ?? []).map((w: { name: string }) => w.name) });
  }
  return match?.id;
}

async function resolveReportByName(
  name: string,
  workspaceId: string,
  bearerToken: string,
): Promise<string | undefined> {
  const url = workspaceId === "me"
    ? "https://api.powerbi.com/v1.0/myorg/reports"
    : `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports`;

  const resp = await fetchWithRetry(url, { headers: { Authorization: bearerToken } });
  if (!resp.ok) {
    logger.warn("[powerbi] Failed to resolve report by name", { name, status: resp.status });
    return undefined;
  }
  const data = await resp.json();
  const match = (data.value ?? []).find(
    (r: { id: string; name: string }) => r.name.toLowerCase() === name.toLowerCase()
  );
  if (!match) {
    logger.warn("[powerbi] Report name not found", { name, available: (data.value ?? []).map((r: { name: string }) => r.name) });
  }
  return match?.id;
}

async function resolveDatasetByName(
  name: string,
  workspaceId: string,
  bearerToken: string,
): Promise<string | undefined> {
  const url = workspaceId === "me"
    ? "https://api.powerbi.com/v1.0/myorg/datasets"
    : `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets`;

  const resp = await fetchWithRetry(url, { headers: { Authorization: bearerToken } });
  if (!resp.ok) {
    logger.warn("[powerbi] Failed to resolve dataset by name", { name, status: resp.status });
    return undefined;
  }
  const data = await resp.json();
  const match = (data.value ?? []).find(
    (d: { id: string; name: string }) => d.name.toLowerCase() === name.toLowerCase()
  );
  if (!match) {
    logger.warn("[powerbi] Dataset name not found", { name, available: (data.value ?? []).map((d: { name: string }) => d.name) });
  }
  return match?.id;
}

let configPromise: Promise<PowerBiConfig | null> | undefined;

export async function getEnv(): Promise<PowerBiConfig | null> {
  if (configPromise) {
    const result = await configPromise;
    if (result !== null) return result;
    configPromise = undefined;
  }
  configPromise = resolveConfig();
  const result = await configPromise;
  if (result === null) configPromise = undefined;
  return result;
}

export function clearEnvCache(): void {
  configPromise = undefined;
  clearTokenCache();
}

async function resolveConfig(): Promise<PowerBiConfig | null> {
  const auth = getAuthConfig();
  if (!auth) {
    logger.warn("[powerbi] Config unavailable: missing auth credentials");
    return null;
  }

  let token: Awaited<ReturnType<typeof getAzureTokenRaw>>;
  try {
    token = await getAzureTokenRaw(auth);
  } catch (err) {
    logger.error("[powerbi] Failed to acquire initial token for config resolution", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
  const bearerToken = `${token.token_type} ${token.access_token}`;

  let workspaceID = process.env.POWERBI_WORKSPACE_ID?.trim() || undefined;
  if (!workspaceID) {
    const workspaceName = process.env.POWERBI_WORKSPACE_NAME?.trim();
    if (workspaceName) {
      workspaceID = await resolveWorkspaceByName(workspaceName, bearerToken);
    }
  }

  if (!workspaceID) {
    logger.warn("[powerbi] Config incomplete: no workspace ID resolved");
    return null;
  }

  let reportID = process.env.POWERBI_REPORT_ID?.trim() || undefined;
  if (!reportID) {
    const reportName = process.env.POWERBI_REPORT_NAME?.trim();
    if (reportName) {
      reportID = await resolveReportByName(reportName, workspaceID, bearerToken);
    }
  }

  let datasetId = process.env.POWERBI_DATASET_ID?.trim() || undefined;
  if (!datasetId) {
    const datasetName = process.env.POWERBI_DATASET_NAME?.trim();
    if (datasetName) {
      datasetId = await resolveDatasetByName(datasetName, workspaceID, bearerToken);
    }
  }

  if (!datasetId) {
    logger.warn("[powerbi] Config incomplete: no dataset ID resolved (needed for DAX queries)");
  }

  let daxDatasetId = process.env.POWERBI_DAX_DATASET_ID?.trim() || undefined;
  if (!daxDatasetId) {
    const daxDatasetName = process.env.POWERBI_DAX_DATASET_NAME?.trim();
    if (daxDatasetName) {
      daxDatasetId = await resolveDatasetByName(daxDatasetName, workspaceID, bearerToken);
    }
  }

  const embedURL = process.env.POWERBI_EMBED_URL?.trim() || null;

  return {
    clientID: auth.clientID,
    clientSecret: auth.clientSecret,
    tenantID: auth.tenantID,
    workspaceID,
    reportID: reportID || "",
    embedURL,
    datasetId: datasetId || "",
    daxDatasetId,
  };
}

export function isConfigured(): boolean {
  const auth = getAuthConfig();
  if (!auth) return false;
  if (!process.env.POWERBI_EMBED_URL?.trim()) return false;

  const hasWorkspace = !!(process.env.POWERBI_WORKSPACE_ID?.trim() || process.env.POWERBI_WORKSPACE_NAME?.trim());
  const hasReport = !!(process.env.POWERBI_REPORT_ID?.trim() || process.env.POWERBI_REPORT_NAME?.trim());
  const hasDataset = !!(process.env.POWERBI_DATASET_ID?.trim() || process.env.POWERBI_DATASET_NAME?.trim());
  return hasWorkspace && hasReport && hasDataset;
}

export function isConfiguredForDax(): boolean {
  const auth = getAuthConfig();
  if (!auth) return false;
  const hasWorkspace = !!(process.env.POWERBI_WORKSPACE_ID?.trim() || process.env.POWERBI_WORKSPACE_NAME?.trim());
  const hasDataset = !!(process.env.POWERBI_DATASET_ID?.trim() || process.env.POWERBI_DATASET_NAME?.trim()
    || process.env.POWERBI_DAX_DATASET_ID?.trim() || process.env.POWERBI_DAX_DATASET_NAME?.trim());
  return hasWorkspace && hasDataset;
}

export function getEffectiveIdentity(): { upn: string; roles: string[] } | null {
  const upn = process.env.POWERBI_EFFECTIVE_IDENTITY_UPN?.trim();
  if (!upn) return null;
  const roles = (process.env.POWERBI_EFFECTIVE_IDENTITY_ROLES?.trim() || "BLO,ALL")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return { upn, roles };
}
