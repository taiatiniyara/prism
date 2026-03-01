"use cache";

import { AllOrganisations } from "../settings/organisations/orgs.service";
import AuthForms from "./form";
import { AllRoles } from "@/app/settings/roles/roles.service";

export default async function AuthPage() {
  const orgs = await AllOrganisations();
  const roles = await AllRoles();
  return (
    <AuthForms
      orgs={orgs}
      roles={roles}
    />
  );
}
