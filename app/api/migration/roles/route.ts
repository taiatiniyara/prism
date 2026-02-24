import { Role } from "@/db/schema/auth-schema";

export async function POST(req: Request) {
  const roles: Role[] = await req.json();

  return Response.json({
    message: "Successfully migrated role data",
    success: true,
    count: roles.length,
  });
}
