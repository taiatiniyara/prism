import { db } from "@/db/connection";
import { user, roles } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { eq } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const users = await db
    .select({
      id: user.id,
      organisation_id: user.organisation_id,
      role_id: user.role_id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .limit(1000);

  const allRoles = await db.select({ id: roles.id, name: roles.name }).from(roles);
  const allOrgs = await db
    .select({ id: organisations.id, name: organisations.name })
    .from(organisations)
    .limit(500);

  const orgById = new Map(allOrgs.map((o) => [o.id, o]));

  return Response.json(
    users.map((u) => {
      const role = allRoles.find((r) => r.id === u.role_id);
      const org = u.organisation_id ? orgById.get(u.organisation_id) : undefined;
      return {
        "User ID": u.id,
        Name: u.name,
        Email: u.email,
        "Organisation ID": u.organisation_id,
        Organisation: org?.name,
        "Role ID": u.role_id,
        Role: role?.name,
      };
    }),
  );
}
