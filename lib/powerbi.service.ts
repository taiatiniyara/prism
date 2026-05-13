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
