import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/connection";
import { user, roles } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";

export async function GET(req: Request) {
  const apiKey = process.env.API_KEY ?? "";
  const inputApiKey = req.headers.get("Authorization") ?? "";
  if (
    apiKey.length !== inputApiKey.length ||
    !timingSafeEqual(Buffer.from(apiKey), Buffer.from(inputApiKey))
  ) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select().from(user);
  const allOrgs = await db.select().from(organisations);
  const allRoles = await db.select().from(roles);

  const output = allUsers.map((u) => {
    const role = allRoles.find((r) => r.id === u.role_id);
    const org = allOrgs.find((o) => o.id === u.organisation_id);
    return {
      "User ID": u.id,
      Username: u.email,
      "Organisation ID": org?.id,
      Organisation: org?.name,
      "Role ID": role?.id,
      Role: role?.name ?? "",
    };
  });

  return Response.json(output);
}
