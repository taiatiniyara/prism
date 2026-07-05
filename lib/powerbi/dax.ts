import { logger } from "@/lib/logging/logger";
import { getAzureToken, fetchWithRetry } from "./auth";
import { getEnv, getEffectiveIdentity } from "./config";
import { checkPbiRateLimit, isPbiCircuitOpen, openPbiCircuit } from "./circuit-breaker";

export interface PowerBiQueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
}

export interface PowerBiEffectiveIdentity {
  username: string;
  roles: string[];
  customData?: string;
}

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
  identity?: PowerBiEffectiveIdentity | null,
): Promise<PowerBiQueryResult> {
  const validation = validateDax(dax);
  if (!validation.valid) {
    throw new Error(`DAX validation failed: ${validation.reason}`);
  }

  const config = await getEnv();
  if (!config || !config.workspaceID) throw new Error("Power BI is not configured");

  if (isPbiCircuitOpen()) {
    throw new Error("Power BI is temporarily unavailable (authentication issue). It will be retried automatically after a 5-minute cooldown.");
  }

  const id = datasetId || config.daxDatasetId || config.datasetId;
  if (!id) throw new Error("No dataset ID configured");

  const azureResponse = await getAzureToken();
  const bearerToken = `${azureResponse.token_type} ${azureResponse.access_token}`;

  const url = `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets/${id}/executeQueries`;

  const body: Record<string, unknown> = {
    queries: [{ query: dax }],
    serializerSettings: { includeNulls: true },
  };

  if (identity?.username) {
    body.identities = [
      {
        username: identity.username,
        roles: identity.roles.length > 0 ? identity.roles : ["ALL"],
        datasets: [id],
        ...(identity.customData ? { customData: identity.customData } : {}),
      },
    ];
  } else {
    const legacyIdentity = getEffectiveIdentity();
    if (legacyIdentity) {
      body.impersonatedUserName = legacyIdentity.upn;
    }
  }

  checkPbiRateLimit();

  const response = await fetchWithRetry(url, {
    method: "POST", headers: { Authorization: bearerToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error("[powerbi] DAX query failed", { status: response.status, error: err.slice(0, 300), daxLength: dax.length });
    if (response.status === 401) {
      openPbiCircuit();
    }
    throw new Error(`DAX query failed (HTTP ${response.status}): ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results: Array<{ tables: Array<{ rows: Record<string, unknown>[] }> }>;
  };

  const rows = data.results?.[0]?.tables?.[0]?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows: rows.slice(0, DAX_MAX_ROWS), columns };
}
