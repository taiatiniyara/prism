"use cache";

import AuthForms from "./form";
import { retrieveRoles, retrieveUtilityData } from "../migration/service";

export default async function AuthPage() {
  const orgs = await retrieveUtilityData();
  const roles = await retrieveRoles();
  return (
    <AuthForms
      orgs={orgs.organisations}
      roles={roles}
    />
  );
}
