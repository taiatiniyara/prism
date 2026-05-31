import { db } from "@/db/connection";
import { user, roles } from "@/db/schema/auth-schema";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const users = await db.select().from(user);
  const allRoles = await db.select().from(roles);

  return Response.json(
    users.map((u) => {
      const role = allRoles.find((r) => r.id === u.role_id);
      return {
        "User ID": u.id,
        "Organisation ID": u.organisation_id,
        "Role ID": u.role_id,
        Role: role?.name,
      };
    }),
  );
}
