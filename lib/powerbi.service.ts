import { getCurrentUser } from "./user.service";
import { logger } from "@/lib/logger";

// Rate limiter: max 60 Power BI REST API calls per rolling 60s window
const pbiCallTimestamps: number[] = [];
const PBI_MAX_CALLS_PER_MINUTE = 60;
const PBI_WINDOW_MS = 60_000;

function checkPbiRateLimit(): void {
  const now = Date.now();
  while (pbiCallTimestamps.length > 0 && now - pbiCallTimestamps[0] > PBI_WINDOW_MS) {
    pbiCallTimestamps.shift();
  }
  if (pbiCallTimestamps.length >= PBI_MAX_CALLS_PER_MINUTE) {
    throw new Error(`Power BI API rate limit exceeded (${PBI_MAX_CALLS_PER_MINUTE} calls/min). Please wait and try again.`);
  }
  pbiCallTimestamps.push(now);
}

interface PowerBiConfig {
  clientID: string;
  clientSecret: string;
  tenantID: string;
  workspaceID: string;
  reportID: string;
  embedURL: string;
  datasetId: string;
}

interface PowerBiAuthConfig {
  clientID: string;
  clientSecret: string;
  tenantID: string;
}

function getAuthConfig(): PowerBiAuthConfig | null {
  const clientID = process.env.POWERBI_CLIENT_ID?.trim();
  const clientSecret = process.env.POWERBI_CLIENT_SECRET?.trim();
  const tenantID = process.env.POWERBI_TENANT_ID?.trim();
  if (!clientID || !clientSecret || !tenantID) return null;
  return { clientID, clientSecret, tenantID };
}

interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  ext_expires_in: number;
}

async function getAzureTokenRaw(auth: PowerBiAuthConfig): Promise<AzureTokenResponse> {
  const loginURL = `https://login.microsoftonline.com/${auth.tenantID}/oauth2/v2.0/token`;

  const requestParams = new URLSearchParams({
    client_id: auth.clientID,
    client_secret: auth.clientSecret,
    grant_type: "client_credentials",
    scope: "https://analysis.windows.net/powerbi/api/.default",
  });

  const response = await fetch(loginURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: requestParams,
  });

  if (!response.ok) {
    throw new Error("Failed to get Azure token");
  }

  return (await response.json()) as AzureTokenResponse;
}

export async function getAzureToken(): Promise<AzureTokenResponse> {
  checkPbiRateLimit();
  const auth = getAuthConfig();
  if (!auth) throw new Error("Power BI is not configured");
  return getAzureTokenRaw(auth);
}

async function resolveWorkspaceByName(name: string, bearerToken: string): Promise<string | undefined> {
  if (name.toLowerCase() === "my workspace") {
    const resp = await fetch("https://api.powerbi.com/v1.0/myorg/groups", {
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

  const resp = await fetch("https://api.powerbi.com/v1.0/myorg/groups", {
    headers: { Authorization: bearerToken },
  });
  if (!resp.ok) return undefined;
  const data = await resp.json();
  const match = (data.value ?? []).find(
    (w: { id: string; name: string }) => w.name.toLowerCase() === name.toLowerCase()
  );
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

  const resp = await fetch(url, { headers: { Authorization: bearerToken } });
  if (!resp.ok) return undefined;
  const data = await resp.json();
  const match = (data.value ?? []).find(
    (r: { id: string; name: string }) => r.name.toLowerCase() === name.toLowerCase()
  );
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

  const resp = await fetch(url, { headers: { Authorization: bearerToken } });
  if (!resp.ok) return undefined;
  const data = await resp.json();
  const match = (data.value ?? []).find(
    (d: { id: string; name: string }) => d.name.toLowerCase() === name.toLowerCase()
  );
  return match?.id;
}

let resolvePromise: Promise<PowerBiConfig | null> | undefined;

export async function getEnv(): Promise<PowerBiConfig | null> {
  if (resolvePromise) return resolvePromise;

  resolvePromise = resolveConfig();
  return resolvePromise;
}

async function resolveConfig(): Promise<PowerBiConfig | null> {
  const auth = getAuthConfig();
  const embedURL = process.env.POWERBI_EMBED_URL?.trim();

  if (!auth || !embedURL) {
    return null;
  }

  const token = await getAzureTokenRaw(auth);
  const bearerToken = `${token.token_type} ${token.access_token}`;

  let workspaceID = process.env.POWERBI_WORKSPACE_ID?.trim() || undefined;
  if (!workspaceID) {
    const workspaceName = process.env.POWERBI_WORKSPACE_NAME?.trim();
    if (workspaceName) {
      workspaceID = await resolveWorkspaceByName(workspaceName, bearerToken);
    }
  }

  let reportID = process.env.POWERBI_REPORT_ID?.trim() || undefined;
  if (!reportID && workspaceID) {
    const reportName = process.env.POWERBI_REPORT_NAME?.trim();
    if (reportName) {
      reportID = await resolveReportByName(reportName, workspaceID, bearerToken);
    }
  }

  let datasetId = process.env.POWERBI_DATASET_ID?.trim() || undefined;
  if (!datasetId && workspaceID) {
    const datasetName = process.env.POWERBI_DATASET_NAME?.trim();
    if (datasetName) {
      datasetId = await resolveDatasetByName(datasetName, workspaceID, bearerToken);
    }
  }

  if (!workspaceID || !reportID || !datasetId) {
    return null;
  }

  return {
    clientID: auth.clientID,
    clientSecret: auth.clientSecret,
    tenantID: auth.tenantID,
    workspaceID,
    reportID,
    embedURL,
    datasetId,
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

function getEffectiveIdentity(): { upn: string; roles: string[] } | null {
  const upn = process.env.POWERBI_EFFECTIVE_IDENTITY_UPN?.trim();
  if (!upn) return null;
  const roles = (process.env.POWERBI_EFFECTIVE_IDENTITY_ROLES?.trim() || "BLO,ALL")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return { upn, roles };
}

export async function powerBiDetails() {
  const config = await getEnv();
  if (!config) throw new Error("Power BI is not configured");

  const azureResponse = await getAzureToken();
  const user = await getCurrentUser();
  const pbiUrl = "https://api.powerbi.com/v1.0/myorg/GenerateToken";

  const body = {
    reports: [
      {
        id: config.reportID,
      },
    ],
    datasets: [
      {
        id: config.datasetId,
      },
    ],
    targetWorkspaces: [
      {
        id: config.workspaceID,
      },
    ],
    identities: [
      {
        username: user.email,
        roles: [user.role, "ALL"],
        datasets: [config.datasetId],
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
    logger.error("Power BI API Error", { error: errorBody });
    throw new Error("Failed to get Power BI token");
  }

  const data = (await response.json()) as { token: string };
  return {
    reportId: config.reportID,
    embedUrl: config.embedURL,
    token: data.token,
  };
}

export interface PowerBiQueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
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
  const config = await getEnv();
  if (!config) throw new Error("Power BI is not configured");

  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets`,
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

export async function getDatasetSchema(
  datasetId?: string,
  tableNames?: string[],
): Promise<TableInfo[]> {
  const config = await getEnv();
  if (!config) throw new Error("Power BI is not configured");

  const id = datasetId || config.datasetId;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;
  const tables: TableInfo[] = [];

  const executeDax = async (dax: string) => {
    const resp = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets/${id}/executeQueries`,
      {
        method: "POST",
        headers: { Authorization: bearerToken, "Content-Type": "application/json" },
        body: JSON.stringify({ queries: [{ query: dax }], serializerSettings: { includeNulls: true } }),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const rows = data.results?.[0]?.tables?.[0]?.rows ?? [];
    return { rows };
  };

  // 1. Discover table names via DBSCHEMA_TABLES
  let discoveredNames: string[] = [];
  try {
    const tablesResult = await executeDax("SELECT [TABLE_NAME] FROM $SYSTEM.DBSCHEMA_TABLES WHERE [TABLE_TYPE] = 'TABLE'");
    if (tablesResult) {
      discoveredNames = tablesResult.rows
        .map((r: Record<string, string>) => r["TABLE_NAME"] || r["[TABLE_NAME]"] || "")
        .filter(Boolean)
        .sort();
    }
  } catch {
    // proceed
  }

  // 2. Discover measures via MDSCHEMA_MEASURES
  try {
    const measuresResult = await executeDax("SELECT * FROM $SYSTEM.MDSCHEMA_MEASURES");
    if (measuresResult) {
      const measureMap = new Map<string, Array<{ name: string; expression: string }>>();
      for (const row of measuresResult.rows) {
        const tName = row["MEASUREGROUP_NAME"] || row["[MEASUREGROUP_NAME]"] || "";
        if (!measureMap.has(tName)) measureMap.set(tName, []);
        measureMap.get(tName)!.push({
          name: row["MEASURE_NAME"] || row["[MEASURE_NAME]"] || "",
          expression: row["MEASURE_CAPTION"] || row["[MEASURE_CAPTION]"] || "",
        });
      }
      for (const [tName, meas] of measureMap) {
        tables.push({ name: tName, columns: [], measures: meas });
      }
    }
  } catch {
    // proceed
  }

  // 3. If tableNames provided, discover columns via EVALUATE TOPN(1, TableName)
  // Otherwise, discover columns for the first 10 discovered tables
  const tablesToExplore = tableNames?.length
    ? tableNames
    : discoveredNames.slice(0, 10);

  for (const tableName of tablesToExplore) {
    try {
      const result = await executeDax(`EVALUATE TOPN(1, '${tableName}')`);
      if (result && result.rows.length > 0) {
        const columns = Object.keys(result.rows[0]).map((col) => ({
          name: col,
          dataType: typeof result.rows[0][col],
        }));
        const existing = tables.find((t) => t.name === tableName);
        if (existing) {
          existing.columns = columns;
        } else {
          tables.push({ name: tableName, columns, measures: [] });
        }
      }
    } catch {
      // table may not exist — skip
    }
  }

  // 4. If we discovered tables without columns, add them as empty entries
  for (const name of discoveredNames) {
    if (!tables.some((t) => t.name === name)) {
      tables.push({ name, columns: [], measures: [] });
    }
  }

  return tables;
}

export async function executeDaxOnDataset(
  dax: string,
  datasetId?: string,
): Promise<PowerBiQueryResult> {
  const config = await getEnv();
  if (!config) throw new Error("Power BI is not configured");

  const id = datasetId || config.datasetId;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const url = `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets/${id}/executeQueries`;

  const identity = getEffectiveIdentity();
  const body: Record<string, unknown> = {
    queries: [{ query: dax }],
    serializerSettings: { includeNulls: true },
  };
  if (identity) {
    body.impersonatedUserName = identity.upn;
  }

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

    const config = await getEnv();
    if (!config) {
      return { ok: false, datasets_accessible: false, message: "Power BI is not configured." };
    }

    const resp = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets`,
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

export async function getReportPages(reportId?: string): Promise<ReportPage[]> {
  const config = await getEnv();
  if (!config) throw new Error("Power BI is not configured");

  const id = reportId || config.reportID;
  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/reports/${id}/pages`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) throw new Error(`Failed to get report pages (HTTP ${resp.status})`);

  const data = await resp.json();
  return (data.value ?? []).map((p: { name: string; displayName: string; order: number }) => ({
    name: p.name, displayName: p.displayName, order: p.order,
  }));
}
