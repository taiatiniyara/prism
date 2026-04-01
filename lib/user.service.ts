import { db } from "@/db/connection";
import { roles, user, type UserStatus } from "@/db/schema/auth-schema";
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
  status: UserStatus;
  reject_reason: string | null;
}

export const getCurrentUser = async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!u) {
    throw new Error("Unauthorized");
  }

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
    status: u.status,
    reject_reason: u.reject_reason,
  };
};
