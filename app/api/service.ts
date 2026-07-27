import { createHash, timingSafeEqual } from "crypto";

// Constant-time secret comparison. Both sides are hashed to a fixed 32-byte
// digest first, so the comparison is constant-time regardless of input length
// and does NOT leak the key length via an early length-mismatch return (the
// previous `if (a.length !== b.length) return false` did).
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const UNAUTHORIZED_MESSAGE =
  "You're not authorized to access this data. Please contact your administrator for an Access Token.";

// Bulk-data ingestion key. Guards the ~90 cross-utility dim*/fact* endpoints
// that Power BI pulls. Lower sensitivity than the identity/secret endpoints
// (see authorizeSensitiveApiKey).
export const authorizeApiKey = async (req: Request) => {
  const requestApiKey = req.headers.get("Authorization");
  const apiKey = process.env.API_KEY;

  if (apiKey && requestApiKey && constantTimeEqual(apiKey, requestApiKey)) {
    return { success: true, message: "Authorized" };
  }
  return { success: false, message: UNAUTHORIZED_MESSAGE };
};

// Higher-sensitivity key for the identity/secret endpoints (/api/users,
// /api/pbiRls — all-user PII; /api/getAzureAccessToken — a live Azure AD
// token). Uses a DEDICATED secret (API_KEY_SENSITIVE) when provisioned, so a
// leak of the bulk-data API_KEY no longer exposes PII or Azure tokens.
//
// Backward-compatible: when API_KEY_SENSITIVE is unset it falls back to
// API_KEY, so behaviour is unchanged until the operator (a) sets
// API_KEY_SENSITIVE and (b) reconfigures the Power BI data sources for those
// three endpoints to send it. See docs/security-remediation.md (D2).
export const authorizeSensitiveApiKey = async (req: Request) => {
  const requestApiKey = req.headers.get("Authorization");
  const sensitiveKey = process.env.API_KEY_SENSITIVE || process.env.API_KEY;

  if (
    sensitiveKey &&
    requestApiKey &&
    constantTimeEqual(sensitiveKey, requestApiKey)
  ) {
    return { success: true, message: "Authorized" };
  }
  return { success: false, message: UNAUTHORIZED_MESSAGE };
};

export function withApiKeyAuth(
  handler: (req: Request) => Promise<Response>,
) {
  return async (req: Request) => {
    const auth = await authorizeApiKey(req);
    if (!auth.success) return Response.json(auth.message);
    return handler(req);
  };
}

export function stripSpecialCharacters(input: string): string {
  return input.replace(/[^a-zA-Z0-9-.]/g, "");
}

export function convertToNumber(value?: string | null): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const cleaned = stripSpecialCharacters(value);
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}
