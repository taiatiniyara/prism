import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export interface CurrentUser {
  name: string;
  role: string;
  email: string;
  id: string;
  role_id: number | null;
  org_id: number | null;
}

export const getCurrentUser = async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.id, session?.user.id!))
    .limit(1);

  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, u.role_id!))
    .limit(1);
  return {
    name: u.name,
    role: role?.name,
    email: u.email,
    id: u.id,
    role_id: u.role_id,
    org_id: u.organisation_id,
  };
};
