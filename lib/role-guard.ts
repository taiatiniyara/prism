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
  "/two-factor",
  "/_next",
  "/favicon.ico",
];

export function getDefaultPageForRole(role: string | null | undefined): string {
  if (!role) return "/auth";
  // A role that exists in the `roles` table but has no entry here (e.g. AFM,
  // CON, DEVPBI, ALM, DON, DASH_*, System) has no configured route access at
  // all: `canAccessRoute` denies every path for it. Falling back to
  // "/dashboard" here used to send those users into an infinite redirect
  // loop in proxy.ts (denied -> redirect to "/dashboard" -> denied again).
  // "/auth" is outside proxy.ts's matcher, so it terminates the loop instead
  // of looping through it. This does NOT grant the role real access — it
  // still needs a proper entry in ROLE_ROUTE_PREFIXES / ROLE_DEFAULT_PAGES
  // once its intended pages are decided.
  return ROLE_DEFAULT_PAGES[role] ?? "/auth";
}

export function canAccessRoute(role: string | null, pathname: string): boolean {
  // Public prefixes are accessible regardless of role — checked first so an
  // unrecognised/unmapped role (or no role at all) can still reach them.
  // Previously this was checked AFTER the role lookup, so any role missing
  // from ROLE_ROUTE_PREFIXES was denied even on public paths; the only thing
  // stopping that from causing a redirect loop was proxy.ts's matcher
  // happening not to cover "/auth". Don't rely on that coincidence.
  if (
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname === "/"
  ) {
    return true;
  }

  if (!role) return false;

  const allowed = ROLE_ROUTE_PREFIXES[role];
  if (!allowed) return false;

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
