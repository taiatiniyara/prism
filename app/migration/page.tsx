"use cache";

import { retrieveRoles } from "./service";

export default async function MigrationPage() {
  const roles = await retrieveRoles();
  console.log(roles);
  return <div>MigrationPage</div>;
}
