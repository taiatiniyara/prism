"use cache";

import { AllOrganisations } from "@/services/orgs.service";
import AuthForms from "./form";
import { AllRoles } from "@/services/roles.service";

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
