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
  // Interim: these roles had no entry at all (see getDefaultPageForRole),
  // which used to redirect-loop. Given the same minimal view-only baseline
  // as EXE/EXT until product decides each role's real page set. NOTE:
  // "System" is presumed to be a non-interactive/service role — granting it
  // UI page access is likely a no-op in practice, but flagging since it was
  // included here mechanically along with the rest, not by design intent.
  AFM: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  CON: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  DEVPBI: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  ALM: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  DON: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  DASH_UTL: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  DASH_COU: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  DASH_REG: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  DASH_PAC: ["/dashboard", "/profile", "/docs", "/prism-ai"],
  System: ["/dashboard", "/profile", "/docs", "/prism-ai"],
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
  AFM: "/dashboard",
  CON: "/dashboard",
  DEVPBI: "/dashboard",
  ALM: "/dashboard",
  DON: "/dashboard",
  DASH_UTL: "/dashboard",
  DASH_COU: "/dashboard",
  DASH_REG: "/dashboard",
  DASH_PAC: "/dashboard",
  System: "/dashboard",
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
  // Every role currently in the `roles` table has an entry above, but a
  // role could still show up here unmapped (a new role added to the DB
  // before being wired in here, a typo, etc). If it did, falling back to
  // "/dashboard" would send it into an infinite redirect loop in proxy.ts
  // (denied -> redirect to "/dashboard" -> denied again, since
  // canAccessRoute denies every path for an unmapped role). "/auth" is
  // outside proxy.ts's matcher, so it terminates the loop instead of
  // looping through it. This does NOT grant the role real access.
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
