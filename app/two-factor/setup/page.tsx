import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user.service";
import { getDefaultPageForRole } from "@/lib/role-guard";
import TwoFactorSetupClient from "./setup-client";

// Mandatory TOTP enrolment for admins (BMO/DEV). proxy.ts redirects any admin
// without 2FA here and holds them here until enrolment completes.
export default async function TwoFactorSetupPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/auth");

  const isAdmin = user.role === "DEV" || user.role === "BMO";
  if (!isAdmin) redirect(getDefaultPageForRole(user.role));
  // Already enrolled → nothing to set up; the per-session challenge lives at /two-factor.
  if (user.two_factor_enabled) redirect("/two-factor");

  return <TwoFactorSetupClient redirectTo={getDefaultPageForRole(user.role)} />;
}
