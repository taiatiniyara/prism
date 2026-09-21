import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccessRoute, getDefaultPageForRole } from "@/lib/role-guard";
import { getCachedUserAndRole } from "@/lib/user-role-cache";

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

  const cached = await getCachedUserAndRole(userId);
  if (!cached) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const currentUser = cached.user;
  const roleName = cached.roleName;

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
    "/migration/:path*",
    "/prism-ai/:path*",
  ],
};
