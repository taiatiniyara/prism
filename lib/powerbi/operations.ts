import { db } from "@/db/connection";
import { benchmarkingRequests } from "@/db/schema/benchmarking-request";
import { organisations } from "@/db/schema/utility";
import { and, eq, or, isNull, gte } from "drizzle-orm";
import { logger } from "@/lib/logging/logger";
import { getAzureToken, fetchWithRetry, getAuthConfig } from "./auth";
import { getEnv, clearEnvCache } from "./config";
import { checkPbiRateLimit, isPbiCircuitOpen, openPbiCircuit } from "./circuit-breaker";

export interface DatasetInfo {
  id: string;
  name: string;
  webUrl: string;
  configuredBy: string;
  isRefreshable: boolean;
  isEffectiveIdentityRequired: boolean;
}

export interface TableInfo {
  name: string;
  columns: Array<{ name: string; dataType: string }>;
  measures: Array<{ name: string; expression: string }>;
}

export interface ReportPage {
  name: string;
  displayName: string;
  order: number;
}

export async function getApprovedBenchmarkingList(orgId: number): Promise<string> {
  const rows = await db
    .select({ acronym: organisations.acronym })
    .from(benchmarkingRequests)
    .innerJoin(
      organisations,
      eq(benchmarkingRequests.benchmark_utility_id, organisations.id),
    )
    .where(
      and(
        eq(benchmarkingRequests.requesting_utility_id, orgId),
        or(
          isNull(benchmarkingRequests.request_expiry),
          gte(benchmarkingRequests.request_expiry, new Date()),
        ),
      ),
    );

  return rows.map((r) => r.acronym).join(",");
}

async function getBearerToken(): Promise<string> {
  const azureResponse = await getAzureToken();
  return `${azureResponse.token_type} ${azureResponse.access_token}`;
}

export async function powerBiDetails(
  user?: { email: string; role: string; org_id: number | null } | null,
): Promise<{ reportId: string; embedUrl: string; token: string }> {
  let config = await getEnv();
  if (!config?.embedURL || !config?.reportID) {
    clearEnvCache();
    config = await getEnv();
  }
  if (!config) throw new Error("Power BI is not configured");
  if (!config.embedURL) throw new Error("Power BI embed is not configured (missing EMBED_URL)");
  if (!config.reportID) throw new Error("Power BI embed is not configured (missing report ID)");

  const azureResponse = await getAzureToken();
  const pbiUrl = "https://api.powerbi.com/v1.0/myorg/GenerateToken";

  const body: Record<string, unknown> = {
    reports: [{ id: config.reportID }],
    datasets: [{ id: config.datasetId }],
    targetWorkspaces: [{ id: config.workspaceID }],
  };

  if (user?.email && user?.role) {
    const approvedBenchmarkingList = user.org_id
      ? await getApprovedBenchmarkingList(user.org_id)
      : "";

    body.identities = [
      {
        username: user.email,
        roles: ["ALL", user.role],
        datasets: [config.datasetId],
        customData: approvedBenchmarkingList,
      },
    ];
  }

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
    embedUrl: config.embedURL!,
    token: data.token,
  };
}

export async function listDatasets(): Promise<DatasetInfo[]> {
  const config = await getEnv();
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  if (isPbiCircuitOpen()) throw new Error("Power BI is temporarily unavailable (authentication issue).");

  const bearerToken = await getBearerToken();

  checkPbiRateLimit();

  const resp = await fetchWithRetry(
    `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets`,
    { headers: { Authorization: bearerToken } },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.error("[powerbi] Failed to list datasets", { status: resp.status, body: body.slice(0, 200) });
    if (resp.status === 401) openPbiCircuit();
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

export async function getDatasetSchema(
  datasetId?: string,
  tableNames?: string[],
): Promise<TableInfo[]> {
  const config = await getEnv();
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  if (isPbiCircuitOpen()) throw new Error("Power BI is temporarily unavailable (authentication issue).");

  const id = datasetId || config.datasetId;
  if (!id) throw new Error("No dataset ID configured");

  const bearerToken = await getBearerToken();
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
  }

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
  }

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
    }
  }

  for (const name of discoveredNames) {
    if (!tables.some((t) => t.name === name)) {
      tables.push({ name, columns: [], measures: [] });
    }
  }

  return tables;
}

export async function testPowerBiConnection(): Promise<{
  ok: boolean;
  datasets_accessible: boolean;
  message: string;
}> {
  try {
    const auth = getAuthConfig();
    if (!auth) {
      return {
        ok: false, datasets_accessible: false,
        message: "POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET, or POWERBI_TENANT_ID is missing from environment variables.",
      };
    }

    const { getAzureTokenRaw } = await import("./auth");
    let tokenResult: Awaited<ReturnType<typeof getAzureTokenRaw>>;
    try {
      tokenResult = await getAzureTokenRaw(auth);
    } catch (tokenErr) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      if (msg.includes("401")) {
        return {
          ok: false, datasets_accessible: false,
          message: `Azure AD rejected credentials (HTTP 401). Verify: (1) POWERBI_CLIENT_ID is the Application (client) ID from the Azure app registration, (2) POWERBI_CLIENT_SECRET is a valid, non-expired client secret, (3) POWERBI_TENANT_ID matches your Azure AD tenant ID (find it in Azure Portal > Tenants). Details: ${msg}`,
        };
      }
      return {
        ok: false, datasets_accessible: false,
        message: `Failed to get Azure token: ${msg}`,
      };
    }
    const bearerToken = `${tokenResult.token_type} ${tokenResult.access_token}`;

    const config = await getEnv();
    if (!config || !config.workspaceID) {
      return {
        ok: false, datasets_accessible: false,
        message: "Azure token obtained successfully, but cannot resolve Power BI workspace. Check POWERBI_WORKSPACE_ID or POWERBI_WORKSPACE_NAME.",
      };
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
        message: `All checks passed. Azure token OK, workspace resolved (${config.workspaceID}), ${count} dataset(s) accessible. Dataset IDs: ${data.value?.map((d: { id: string; name: string }) => `${d.name}(${d.id})`).join(", ") || "none"}`,
      };
    }

    if (resp.status === 403) {
      return {
        ok: false, datasets_accessible: false,
        message: `Azure token OK, workspace found (${config.workspaceID}), but Power BI returned 403 Forbidden on dataset access. Fix: (1) In Power BI Admin Portal > Tenant settings > Developer settings, enable "Allow service principals to use Power BI APIs" — ensure it's set to "Enabled for the entire organization" or the security group containing this service principal, (2) In the Power BI workspace (${config.workspaceID}) > Manage access, add the service principal (client ID: ${auth.clientID}) as a Member or Contributor — NOT just Viewer. Changes may take a few minutes to propagate.`,
      };
    }

    if (resp.status === 401) {
      return {
        ok: false, datasets_accessible: false,
        message: `Azure token obtained but Power BI rejected it (HTTP 401). This usually means the Azure AD app registration is missing API permissions. In Azure Portal > App registrations > ${auth.clientID} > API permissions, add "Power BI Service" with "Dataset.Read.All" permission and click "Grant admin consent".`,
      };
    }

    return {
      ok: false, datasets_accessible: false,
      message: `Azure token OK, workspace found (${config.workspaceID}), but dataset access returned HTTP ${resp.status}.`,
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

export async function getReportPages(reportId?: string): Promise<ReportPage[]> {
  const config = await getEnv();
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  if (isPbiCircuitOpen()) throw new Error("Power BI is temporarily unavailable (authentication issue).");

  const id = reportId || config.reportID;
  if (!id) throw new Error("No report ID configured");

  const bearerToken = await getBearerToken();

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
