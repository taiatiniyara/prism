import { getCurrentUser } from "./user.service";
import { logger } from "@/lib/logger";

// ---- Rate limiter: max 60 Power BI REST API calls per rolling 60s window ----
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

// ---- Retry with exponential backoff ----
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1000;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = RETRY_MAX_ATTEMPTS,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, init);
    if (resp.ok) return resp;
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt < retries) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        logger.warn(`[powerbi] Retrying after HTTP ${resp.status}`, { url: url.split("?")[0], attempt: attempt + 1, delayMs: Math.round(delay) });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
    return resp;
  }
  throw new Error(`Power BI API request failed after ${retries + 1} attempts: ${url}`);
}

// ---- Types ----
interface PowerBiConfig {
  clientID: string;
  clientSecret: string;
  tenantID: string;
  workspaceID: string;
  reportID: string;
  embedURL: string | null;
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

// ---- Token management with expiry tracking ----
interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  ext_expires_in: number;
}

interface TokenCacheEntry {
  token: AzureTokenResponse;
  expiresAt: number;
}

let tokenCache: TokenCacheEntry | null = null;

async function getAzureTokenRaw(auth: PowerBiAuthConfig): Promise<AzureTokenResponse> {
  const loginURL = `https://login.microsoftonline.com/${auth.tenantID}/oauth2/v2.0/token`;

  const requestParams = new URLSearchParams({
    client_id: auth.clientID,
    client_secret: auth.clientSecret,
    grant_type: "client_credentials",
    scope: "https://analysis.windows.net/powerbi/api/.default",
  });

  checkPbiRateLimit();

  const response = await fetchWithRetry(loginURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: requestParams,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("[powerbi] Failed to get Azure token", { status: response.status, body: body.slice(0, 300) });
    throw new Error(`Failed to get Azure token (HTTP ${response.status})`);
  }

  return (await response.json()) as AzureTokenResponse;
}

export async function getAzureToken(): Promise<AzureTokenResponse> {
  const auth = getAuthConfig();
  if (!auth) throw new Error("Power BI is not configured");

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  tokenCache = {
    token: await getAzureTokenRaw(auth),
    expiresAt: now + 50 * 60 * 1000,
  };
  return tokenCache.token;
}

// ---- Name resolution with logging ----
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

// ---- Config resolution (lazy, not permanently cached) ----
let configPromise: Promise<PowerBiConfig | null> | undefined;

export async function getEnv(): Promise<PowerBiConfig | null> {
  if (configPromise) return configPromise;
  configPromise = resolveConfig();
  return configPromise;
}

export function clearEnvCache(): void {
  configPromise = undefined;
  tokenCache = null;
}

async function resolveConfig(): Promise<PowerBiConfig | null> {
  const auth = getAuthConfig();
  if (!auth) {
    logger.warn("[powerbi] Config unavailable: missing auth credentials");
    return null;
  }

  let token: AzureTokenResponse;
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

  const embedURL = process.env.POWERBI_EMBED_URL?.trim() || null;

  return {
    clientID: auth.clientID,
    clientSecret: auth.clientSecret,
    tenantID: auth.tenantID,
    workspaceID,
    reportID: reportID || "",
    embedURL,
    datasetId: datasetId || "",
  };
}

// ---- Configuration checks ----
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
  const hasDataset = !!(process.env.POWERBI_DATASET_ID?.trim() || process.env.POWERBI_DATASET_NAME?.trim());
  return hasWorkspace && hasDataset;
}

// ---- Effective identity ----
function getEffectiveIdentity(): { upn: string; roles: string[] } | null {
  const upn = process.env.POWERBI_EFFECTIVE_IDENTITY_UPN?.trim();
  if (!upn) return null;
  const roles = (process.env.POWERBI_EFFECTIVE_IDENTITY_ROLES?.trim() || "BLO,ALL")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return { upn, roles };
}

// ---- Embed token generation ----
export async function powerBiDetails() {
  const config = await getEnv();
  if (!config || !config.embedURL) throw new Error("Power BI embed is not configured (missing EMBED_URL)");
  if (!config.reportID) throw new Error("Power BI embed is not configured (missing report ID)");

  const azureResponse = await getAzureToken();
  const user = await getCurrentUser();
  const pbiUrl = "https://api.powerbi.com/v1.0/myorg/GenerateToken";

  const identity = getEffectiveIdentity();

  const body = {
    reports: [{ id: config.reportID }],
    datasets: [{ id: config.datasetId }],
    targetWorkspaces: [{ id: config.workspaceID }],
    identities: identity
      ? [{
          username: identity.upn,
          roles: identity.roles,
          datasets: [config.datasetId],
        }]
      : [{
          username: user.email,
          roles: [user.role, "ALL"],
          datasets: [config.datasetId],
        }],
  };

  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const response = await fetchWithRetry(pbiUrl, {
    method: "POST",
    headers: {
      Authorization: bearerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("[powerbi] GenerateToken API Error", { status: response.status, error: errorBody.slice(0, 300) });
    throw new Error("Failed to get Power BI embed token");
  }

  const data = (await response.json()) as { token: string };
  return {
    reportId: config.reportID,
    embedUrl: config.embedURL,
    token: data.token,
  };
}

// ---- Types ----
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
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  checkPbiRateLimit();

  const resp = await fetchWithRetry(
    `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.error("[powerbi] Failed to list datasets", { status: resp.status, body: body.slice(0, 200) });
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
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  const id = datasetId || config.datasetId;
  if (!id) throw new Error("No dataset ID configured");

  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;
  const tables: TableInfo[] = [];

  const executeDax = async (dax: string) => {
    checkPbiRateLimit();
    const resp = await fetchWithRetry(
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

  // 3. Discover columns via EVALUATE TOPN(1, TableName)
  const tablesToExplore = tableNames?.length
    ? tableNames.slice(0, 10)
    : discoveredNames.slice(0, 10);

  for (const tableName of tablesToExplore) {
    try {
      const sanitizedName = tableName.replace(/[^a-zA-Z0-9_\s]/g, "");
      const result = await executeDax(`EVALUATE TOPN(1, '${sanitizedName}')`);
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

  // 4. Add undiscovered tables as empty entries
  for (const name of discoveredNames) {
    if (!tables.some((t) => t.name === name)) {
      tables.push({ name, columns: [], measures: [] });
    }
  }

  return tables;
}

// ---- DAX validation ----
const DAX_MAX_LENGTH = 8000;
const DAX_BLOCKED_PATTERNS = [
  /\bREFRESH\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bTRUNCATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];
const DAX_MAX_ROWS = 500;

function validateDax(dax: string): { valid: boolean; reason?: string } {
  if (!dax || !dax.trim()) {
    return { valid: false, reason: "DAX query is empty." };
  }
  if (dax.length > DAX_MAX_LENGTH) {
    return { valid: false, reason: `DAX query too long (max ${DAX_MAX_LENGTH} chars).` };
  }
  for (const pattern of DAX_BLOCKED_PATTERNS) {
    if (pattern.test(dax)) {
      return { valid: false, reason: "DAX query contains disallowed statements. Only read-only queries are permitted." };
    }
  }
  return { valid: true };
}

export async function executeDaxOnDataset(
  dax: string,
  datasetId?: string,
): Promise<PowerBiQueryResult> {
  const validation = validateDax(dax);
  if (!validation.valid) {
    throw new Error(`DAX validation failed: ${validation.reason}`);
  }

  const config = await getEnv();
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  const id = datasetId || config.datasetId;
  if (!id) throw new Error("No dataset ID configured");

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

  checkPbiRateLimit();

  const response = await fetchWithRetry(url, {
    method: "POST", headers: { Authorization: bearerToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error("[powerbi] DAX query failed", { status: response.status, error: err.slice(0, 300), daxLength: dax.length });
    throw new Error(`DAX query failed (HTTP ${response.status}): ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results: Array<{ tables: Array<{ rows: Record<string, unknown>[] }> }>;
  };

  const rows = data.results?.[0]?.tables?.[0]?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows: rows.slice(0, DAX_MAX_ROWS), columns };
}

// ---- Connection test ----
export async function testPowerBiConnection(): Promise<{
  ok: boolean;
  datasets_accessible: boolean;
  message: string;
}> {
  try {
    const azureResponse = await getAzureToken();
    const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

    const config = await getEnv();
    if (!config || !config.workspaceID) {
      return { ok: false, datasets_accessible: false, message: "Power BI is not configured." };
    }

    checkPbiRateLimit();

    const resp = await fetchWithRetry(
      `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets`,
      { headers: { Authorization: bearerToken } },
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
    logger.error("[powerbi] Connection test failed", { error: err instanceof Error ? err.message : String(err) });
    return {
      ok: false,
      datasets_accessible: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

// ---- Report pages ----
export interface ReportPage {
  name: string;
  displayName: string;
  order: number;
}

export async function getReportPages(reportId?: string): Promise<ReportPage[]> {
  const config = await getEnv();
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  const id = reportId || config.reportID;
  if (!id) throw new Error("No report ID configured");

  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  checkPbiRateLimit();

  const resp = await fetchWithRetry(
    `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/reports/${id}/pages`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.error("[powerbi] Failed to get report pages", { status: resp.status, reportId: id, body: body.slice(0, 200) });
    throw new Error(`Failed to get report pages (HTTP ${resp.status})`);
  }

  const data = await resp.json();
  return (data.value ?? []).map((p: { name: string; displayName: string; order: number }) => ({
    name: p.name, displayName: p.displayName, order: p.order,
  }));
}
