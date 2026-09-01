import { logger } from "@/lib/logging/logger";
import { checkPbiRateLimit } from "./circuit-breaker";

export interface PowerBiConfig {
  clientID: string;
  clientSecret: string;
  tenantID: string;
  workspaceID: string;
  reportID: string;
  embedURL: string | null;
  datasetId: string;
  daxDatasetId?: string;
}

interface PowerBiAuthConfig {
  clientID: string;
  clientSecret: string;
  tenantID: string;
  username?: string;
  password?: string;
}

export function getAuthConfig(): PowerBiAuthConfig | null {
  const clientID = process.env.POWERBI_CLIENT_ID?.trim();
  const clientSecret = process.env.POWERBI_CLIENT_SECRET?.trim();
  const tenantID = process.env.POWERBI_TENANT_ID?.trim();
  if (!clientID || !clientSecret || !tenantID) return null;
  const username = process.env.POWERBI_USERNAME?.trim() || undefined;
  const password = process.env.POWERBI_PASSWORD?.trim() || undefined;
  return { clientID, clientSecret, tenantID, username, password };
}

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

export function clearTokenCache(): void {
  tokenCache = null;
}

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1000;

export async function fetchWithRetry(
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

async function getAzureTokenRaw(auth: PowerBiAuthConfig): Promise<AzureTokenResponse> {
  const loginURL = `https://login.microsoftonline.com/${auth.tenantID}/oauth2/v2.0/token`;

  const usePassword = auth.username && auth.password;
  const requestParams = new URLSearchParams({
    client_id: auth.clientID,
    scope: "https://analysis.windows.net/powerbi/api/.default",
    ...(usePassword
      ? {
          grant_type: "password",
          username: auth.username!,
          password: auth.password!,
          ...(auth.clientSecret ? { client_secret: auth.clientSecret } : {}),
        }
      : {
          grant_type: "client_credentials",
          client_secret: auth.clientSecret,
        }),
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

export { getAzureTokenRaw };
