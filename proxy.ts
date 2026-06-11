import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { eq } from "drizzle-orm";
import { canAccessRoute, getDefaultPageForRole } from "@/lib/role-guard";

const userRoleCache = new Map<string, { user: typeof user.$inferSelect; roleName: string | null; ts: number }>();
const CACHE_TTL_MS = 5000;

export async function proxy(request: NextRequest) {
  const isRscRequest = request.headers.get("RSC") === "1";

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const { pathname } = request.nextUrl;
  const userId = session.user.id;
  const now = Date.now();

  let currentUser;
  let roleName: string | null = null;

  const cached = userRoleCache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    currentUser = cached.user;
    roleName = cached.roleName;
  } else {
    const [fetchedUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!fetchedUser) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }

    currentUser = fetchedUser;

    if (currentUser.role_id) {
      const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, currentUser.role_id))
        .limit(1);
      roleName = role?.name ?? null;
    }

    userRoleCache.set(userId, { user: currentUser, roleName, ts: now });
  }

  if (!currentUser.emailVerified) {
    if (
      !pathname.startsWith("/profile") &&
      !pathname.startsWith("/api") &&
      !isRscRequest
    ) {
      return NextResponse.redirect(new URL("/profile?verify=required", request.url));
    }
  }

  if (!canAccessRoute(roleName, pathname)) {
    const defaultPage = getDefaultPageForRole(roleName);
    return NextResponse.redirect(new URL(defaultPage, request.url));
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
