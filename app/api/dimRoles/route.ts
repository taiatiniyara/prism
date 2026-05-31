import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json(authorize.message);
  }

  const allRoles = await db.select().from(roles);

  return Response.json(
    allRoles.map((role) => ({
      "Role ID": role.id,
      "Role Name": role.name,
      "Role Description": role.description,
    })),
  );
}
