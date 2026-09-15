/**
 * Shared origin validation for AI API routes.
 * Validates that requests come from the configured app URL.
 */
export function isValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (!appUrl) return false;

  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(appUrl).origin;
  } catch {
    return false;
  }

  // Compare parsed origins exactly — a prefix check (e.g. origin.startsWith(appUrl))
  // is bypassable by an attacker-controlled host like "<appUrl>.evil.com", since that
  // string also starts with appUrl.
  const matches = (value: string | null): boolean => {
    if (!value) return false;
    try {
      return new URL(value).origin === allowedOrigin;
    } catch {
      return false;
    }
  };

  return matches(origin) || matches(referer);
}
