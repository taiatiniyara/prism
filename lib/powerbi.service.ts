import { getCurrentUser } from "./user.service";

const getRequiredEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing Power BI environment variable: ${key}`);
  }
  return value;
};

export const powerBiCLientID = getRequiredEnv("POWERBI_CLIENT_ID");
export const powerBiClientSecret = getRequiredEnv("POWERBI_CLIENT_SECRET");
export const powerBiTenantID = getRequiredEnv("POWERBI_TENANT_ID");
export const powerBiWorkspaceID = getRequiredEnv("POWERBI_WORKSPACE_ID");
export const powerBiReportID = getRequiredEnv("POWERBI_REPORT_ID");
export const powerBiEmbedURL = getRequiredEnv("POWERBI_EMBED_URL");
export const datasetID = getRequiredEnv("POWERBI_DATASET_ID");

if (
  !powerBiCLientID ||
  !powerBiClientSecret ||
  !powerBiTenantID ||
  !powerBiWorkspaceID ||
  !powerBiReportID ||
  !powerBiEmbedURL ||
  !datasetID
) {
  throw new Error("Missing Power BI environment variables");
}

interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  ext_expires_in: number;
}

export async function getAzureToken() {
  const loginURL = `https://login.microsoftonline.com/${powerBiTenantID}/oauth2/v2.0/token`;

  const requestParams = new URLSearchParams({
    client_id: powerBiCLientID,
    client_secret: powerBiClientSecret,
    grant_type: "client_credentials",
    scope: "https://analysis.windows.net/powerbi/api/.default",
  });

  const response = await fetch(loginURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestParams,
  });

  if (!response.ok) {
    throw new Error("Failed to get Azure token");
  }

  const data = (await response.json()) as AzureTokenResponse;
  return data;
}

export async function powerBiDetails() {
  const azureResponse = await getAzureToken();
  const user = await getCurrentUser();
  const pbiUrl = "https://api.powerbi.com/v1.0/myorg/GenerateToken";

  const body = {
    reports: [
      {
        id: powerBiReportID,
      },
    ],
    datasets: [
      {
        id: datasetID,
      },
    ],
    targetWorkspaces: [
      {
        id: powerBiWorkspaceID,
      },
    ],
    identities: [
      {
        username: user.email,
        roles: [user.role, "ALL"],
        datasets: [datasetID],
      },
    ],
  };

  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const headers = {
    Authorization: bearerToken,
    "Content-Type": "application/json",
  };

  const response = await fetch(pbiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Power BI API Error:", errorBody);
    throw new Error("Failed to get Power BI token");
  }

  const data = (await response.json()) as { token: string };
  return {
    reportId: powerBiReportID,
    embedUrl: powerBiEmbedURL,
    token: data.token,
  };
}

export interface PowerBiQueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
}

export async function executeDaxQuery(
  dax: string,
): Promise<PowerBiQueryResult> {
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;
  const url = `https://api.powerbi.com/v1.0/myorg/datasets/${datasetID}/executeQueries`;

  const body = {
    queries: [{ query: dax }],
    serializerSettings: { includeNulls: true },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: bearerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Power BI DAX query failed (HTTP ${response.status}): ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results: Array<{
      tables: Array<{
        rows: Record<string, unknown>[];
      }>;
    }>;
  };

  const rows = data.results?.[0]?.tables?.[0]?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { rows, columns };
}

export interface DatasetInfo {
  id: string;
  name: string;
  webUrl: string;
  configuredBy: string;
  isRefreshable: boolean;
  isEffectiveIdentityRequired: boolean;
}

export async function listDatasets(): Promise<DatasetInfo[]> {
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/datasets`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) {
    throw new Error(`Failed to list datasets (HTTP ${resp.status})`);
  }

  const data = await resp.json();
  return (data.value ?? []).map((d: {
    id: string; name: string; webUrl: string; configuredBy: string;
    isRefreshable: boolean; isEffectiveIdentityRequired: boolean;
  }) => ({
    id: d.id, name: d.name, webUrl: d.webUrl,
    configuredBy: d.configuredBy, isRefreshable: d.isRefreshable,
    isEffectiveIdentityRequired: d.isEffectiveIdentityRequired,
  }));
}

export interface TableInfo {
  name: string;
  columns: Array<{ name: string; dataType: string }>;
  measures: Array<{ name: string; expression: string }>;
}

export async function getDatasetSchema(datasetId?: string): Promise<TableInfo[]> {
  const id = datasetId || datasetID;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  // Get tables
  const tablesResp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/datasets/${id}/tables`,
    { headers: { Authorization: bearerToken } },
  );

  if (!tablesResp.ok) {
    throw new Error(`Failed to get dataset schema (HTTP ${tablesResp.status})`);
  }

  const tablesData = await tablesResp.json();
  const tables: TableInfo[] = [];

  for (const table of (tablesData.value ?? [])) {
    const name = table.name;
    const columns = (table.columns ?? []).map((c: { name: string; dataType: string }) => ({
      name: c.name, dataType: c.dataType,
    }));
    const measures = (table.measures ?? []).map((m: { name: string; expression: string }) => ({
      name: m.name, expression: m.expression,
    }));
    tables.push({ name, columns, measures });
  }

  return tables;
}

export async function executeDaxOnDataset(
  dax: string,
  datasetId?: string,
): Promise<PowerBiQueryResult> {
  const id = datasetId || datasetID;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const url = `https://api.powerbi.com/v1.0/myorg/datasets/${id}/executeQueries`;

  const body = {
    queries: [{ query: dax }],
    serializerSettings: { includeNulls: true },
  };

  const response = await fetch(url, {
    method: "POST", headers: { Authorization: bearerToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DAX query failed (HTTP ${response.status}): ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results: Array<{ tables: Array<{ rows: Record<string, unknown>[] }> }>;
  };

  const rows = data.results?.[0]?.tables?.[0]?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

export async function testPowerBiConnection(): Promise<{
  ok: boolean;
  datasets_accessible: boolean;
  message: string;
}> {
  try {
    const azureResponse = await getAzureToken();
    const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

    const resp = await fetch(
      `https://api.powerbi.com/v1.0/myorg/datasets`,
      {
        headers: { Authorization: bearerToken },
      },
    );

    if (resp.ok) {
      const data = await resp.json();
      const count = data.value?.length ?? 0;
      return {
        ok: true,
        datasets_accessible: true,
        message: `Connected. Found ${count} datasets. Dataset IDs: ${data.value?.map((d: { id: string; name: string }) => `${d.name}(${d.id})`).join(", ") || "none"}`,
      };
    }

    if (resp.status === 403) {
      return {
        ok: false,
        datasets_accessible: false,
        message: "403 Forbidden. The service principal cannot access Power BI datasets. Enable 'Allow service principals to use Power BI APIs' in the Power BI Admin Portal, and add the service principal to the workspace.",
      };
    }

    return {
      ok: false,
      datasets_accessible: false,
      message: `Unexpected response: HTTP ${resp.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      datasets_accessible: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export interface ReportPage {
  name: string;
  displayName: string;
  order: number;
}

export interface ReportVisual {
  name: string;
  title: string;
  type: string;
}

export async function getReportPages(reportId?: string): Promise<ReportPage[]> {
  const id = reportId || powerBiReportID;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/reports/${id}/pages`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) throw new Error(`Failed to get report pages (HTTP ${resp.status})`);

  const data = await resp.json();
  return (data.value ?? []).map((p: { name: string; displayName: string; order: number }) => ({
    name: p.name, displayName: p.displayName, order: p.order,
  }));
}

export async function getReportVisuals(
  pageName: string,
  reportId?: string,
): Promise<ReportVisual[]> {
  const id = reportId || powerBiReportID;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/reports/${id}/pages/${pageName}/visuals`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) throw new Error(`Failed to get report visuals (HTTP ${resp.status})`);

  const data = await resp.json();
  return (data.value ?? []).map((v: { name: string; title: string; type: string }) => ({
    name: v.name, title: v.title, type: v.type,
  }));
}

export async function exportReportVisual(
  pageName: string,
  visualName: string,
  reportId?: string,
): Promise<string> {
  const id = reportId || powerBiReportID;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/reports/${id}/pages/${pageName}/visuals/${visualName}/ExportData`,
    {
      method: "GET",
      headers: { Authorization: bearerToken },
    },
  );

  if (!resp.ok && resp.status !== 202) {
    throw new Error(`Export failed (HTTP ${resp.status})`);
  }

  if (resp.status === 202) {
    const location = resp.headers.get("Location");
    if (location) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollResp = await fetch(location, { headers: { Authorization: bearerToken } });
        if (pollResp.ok) {
          const exportData = await pollResp.json();
          return JSON.stringify(exportData);
        }
        if (pollResp.status !== 202) break;
      }
    }
    throw new Error("Export timed out");
  }

  const exportData = await resp.json();
  return JSON.stringify(exportData);
}
