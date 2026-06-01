import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { eq } from "drizzle-orm";
import { canAccessRoute, getDefaultPageForRole } from "@/lib/role-guard";

const PRIVILEGED_ROLES = new Set(["DEV", "BMO"]);
const MFA_REQUIRED_PREFIXES = ["/settings/users", "/settings/kpi", "/migration"];

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const { pathname } = request.nextUrl;

  const [currentUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!currentUser) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (!currentUser.emailVerified) {
    if (!pathname.startsWith("/profile") && !pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/profile?verify=required", request.url));
    }
  }

  const [role] = currentUser.role_id
    ? await db
        .select()
        .from(roles)
        .where(eq(roles.id, currentUser.role_id))
        .limit(1)
    : [null];

  const roleName = role?.name ?? null;

  if (!canAccessRoute(roleName, pathname)) {
    const defaultPage = getDefaultPageForRole(roleName);
    return NextResponse.redirect(new URL(defaultPage, request.url));
  }

  if (
    roleName != null &&
    PRIVILEGED_ROLES.has(roleName) &&
    MFA_REQUIRED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
    !session.user.twoFactorEnabled
  ) {
    return NextResponse.redirect(new URL("/profile?mfa=required", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/data-entry/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/docs/:path*",
    "/migration/:path*",
    "/prism-ai/:path*",
  ],
};
