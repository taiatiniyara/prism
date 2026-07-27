import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user.service";
import { getDefaultPageForRole } from "@/lib/role-guard";
import TwoFactorChallenge from "./challenge-client";

// Login-time TOTP challenge for admins (BMO/DEV). Reached after a magic-link
// login when the session has not yet passed the challenge (enforced by proxy.ts).
export default async function TwoFactorPage() {
  // skipMfaCheck: this page IS the MFA challenge — the admin hasn't passed it yet.
  const user = await getCurrentUser({ skipMfaCheck: true }).catch(() => null);
  if (!user) redirect("/auth");

  const isAdmin = user.role === "DEV" || user.role === "BMO";
  if (!isAdmin) redirect(getDefaultPageForRole(user.role));
  // Not enrolled yet → go set up first.
  if (!user.two_factor_enabled) redirect("/two-factor/setup");

  return <TwoFactorChallenge redirectTo={getDefaultPageForRole(user.role)} />;
}
