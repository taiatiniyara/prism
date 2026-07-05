import { db } from "@/db/connection";
import { asc } from "drizzle-orm";
import { sidebarAccess } from "@/db/schema/rls";

export const ROLE_ROUTE_PREFIXES: Record<string, string[]> = {
  DEV: [
    "/dashboard",
    "/data-entry",
    "/settings",
    "/profile",
    "/docs",
    "/migration",
    "/prism-ai",
  ],
  BMO: [
    "/dashboard",
    "/data-entry",
    "/settings",
    "/profile",
    "/docs",
    "/data-entry/downloads",
    "/prism-ai",
  ],
  BLO: [
    "/dashboard",
    "/data-entry",
    "/settings",
    "/profile",
    "/docs",
    "/prism-ai",
  ],
  CEO: ["/dashboard", "/data-entry", "/profile", "/docs", "/prism-ai"],
  DAOF: ["/dashboard", "/data-entry", "/profile", "/docs", "/prism-ai"],
  DAOH: ["/dashboard", "/data-entry", "/profile", "/docs", "/prism-ai"],
  DAOO: ["/dashboard", "/data-entry", "/profile", "/docs", "/prism-ai"],
  EXE: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  EXT: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  MGR: ["/dashboard", "/profile", "/docs", "/prism-ai"],
};

export const ROLE_DEFAULT_PAGES: Record<string, string> = {
  DEV: "/dashboard",
  BMO: "/dashboard",
  BLO: "/data-entry",
  CEO: "/data-entry",
  DAOF: "/data-entry/enter-data",
  DAOH: "/data-entry/enter-data",
  DAOO: "/data-entry/enter-data",
  EXE: "/dashboard",
  EXT: "/dashboard",
  MGR: "/data-entry",
};

export const PUBLIC_PREFIXES = [
  "/auth",
  "/api/auth",
  "/api/webhooks",
  "/_next",
  "/favicon.ico",
];

export function getDefaultPageForRole(role: string | null | undefined): string {
  if (!role) return "/auth";
  return ROLE_DEFAULT_PAGES[role] ?? "/dashboard";
}

export function canAccessRoute(role: string | null, pathname: string): boolean {
  if (!role) return false;

  const allowed = ROLE_ROUTE_PREFIXES[role];
  if (!allowed) return false;

  if (
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname === "/"
  ) {
    return true;
  }

  return allowed.some((prefix) => pathname.startsWith(prefix));
}

export async function getSidebarForRole(
  roleName: string,
): Promise<{ name: string; page: string }[]> {
  const all = await db
    .select()
    .from(sidebarAccess)
    .orderBy(asc(sidebarAccess.order));

  return all
    .filter((item) => item.roles.split(",").includes(roleName))
    .map((item) => ({ name: item.name, page: item.page }));
}

export async function isRoleAllowedForRoute(
  roleName: string,
  pathname: string,
): Promise<boolean> {
  const prefixAllowed = canAccessRoute(roleName, pathname);
  if (!prefixAllowed) return false;

  const sidebar = await getSidebarForRole(roleName);
  const allowedPages = sidebar.map((item) => item.page);

  if (allowedPages.some((page) => pathname.startsWith(page))) {
    return true;
  }

  const topSegments = new Set(
    allowedPages.map((p) => {
      const parts = p.split("/");
      return parts.slice(0, 2).join("/");
    }),
  );

  const requestedTop = "/" + pathname.split("/").slice(1, 3).join("/");

  if (topSegments.has(requestedTop)) return true;
  if (topSegments.has("/" + pathname.split("/")[1])) return true;

  return false;
}
