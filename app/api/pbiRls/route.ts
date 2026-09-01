import { db } from "@/db/connection";
import { user, roles } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { authorizeSensitiveApiKey } from "../service";

export async function GET(req: Request) {
  const auth = await authorizeSensitiveApiKey(req);
  if (!auth.success) {
    return Response.json({ message: auth.message }, { status: 401 });
  }

  const allUsers = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      organisation_id: user.organisation_id,
      role_id: user.role_id,
    })
    .from(user)
    .limit(1000);

  const allOrgs = await db
    .select({ id: organisations.id, name: organisations.name })
    .from(organisations)
    .limit(500);

  const allRoles = await db.select({ id: roles.id, name: roles.name }).from(roles);

  const orgById = new Map(allOrgs.map((o) => [o.id, o]));

  return Response.json(
    allUsers.map((u) => {
      const role = allRoles.find((r) => r.id === u.role_id);
      const org = u.organisation_id ? orgById.get(u.organisation_id) : undefined;
      return {
        "User ID": u.id,
        Username: u.email,
        Name: u.name,
        "Organisation ID": org?.id,
        Organisation: org?.name,
        "Role ID": role?.id,
        Role: role?.name ?? "",
      };
    }),
  );
}
