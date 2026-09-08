import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  getDefaultPageForRole,
  ROLE_DEFAULT_PAGES,
  ROLE_ROUTE_PREFIXES,
} from "@/lib/role-guard";

// A role that does NOT exist in the `roles` table (or this map) at all,
// used purely to exercise the "unmapped role" fallback behaviour — e.g. a
// new role added to the DB before being wired in here. Every real role
// currently has an interim entry (see below), so this must stay synthetic.
const UNMAPPED_ROLE = "SOME_FUTURE_ROLE_NOT_YET_WIRED_UP";

// Roles that had no entry at all until the AFM ticket surfaced the gap, and
// were granted the same minimal interim view-only baseline as EXE/EXT.
const INTERIM_DASHBOARD_ONLY_ROLES = [
  "AFM",
  "CON",
  "DEVPBI",
  "ALM",
  "DON",
  "DASH_UTL",
  "DASH_COU",
  "DASH_REG",
  "DASH_PAC",
  "System",
];

describe("role-guard", () => {
  it("returns the configured default page for a known role", () => {
    expect(getDefaultPageForRole("DEV")).toBe("/dashboard");
    expect(getDefaultPageForRole("MGR")).toBe("/data-entry");
  });

  it.each(INTERIM_DASHBOARD_ONLY_ROLES)(
    "grants %s the interim dashboard-only baseline",
    (role) => {
      // These previously had no entry at all, which caused an infinite
      // redirect loop in proxy.ts once a session for that role existed.
      // Granted the same minimal view-only baseline as EXE/EXT as an
      // interim fix, pending a real product decision per role.
      expect(getDefaultPageForRole(role)).toBe("/dashboard");
      expect(canAccessRoute(role, "/dashboard")).toBe(true);
      expect(canAccessRoute(role, "/profile")).toBe(true);
      expect(canAccessRoute(role, "/settings")).toBe(false);
      expect(canAccessRoute(role, "/data-entry")).toBe(false);
    },
  );

  it("returns /auth for a role with no route access configured", () => {
    // Regression test for the redirect-loop bug: falling back to
    // "/dashboard" here for an unmapped role used to send proxy.ts into an
    // infinite loop, since canAccessRoute(unmappedRole, "/dashboard") is
    // also always false.
    expect(ROLE_ROUTE_PREFIXES[UNMAPPED_ROLE]).toBeUndefined();
    expect(ROLE_DEFAULT_PAGES[UNMAPPED_ROLE]).toBeUndefined();
    expect(getDefaultPageForRole(UNMAPPED_ROLE)).toBe("/auth");
  });

  it("returns /auth when the user has no role at all", () => {
    expect(getDefaultPageForRole(null)).toBe("/auth");
    expect(getDefaultPageForRole(undefined)).toBe("/auth");
  });

  it("never resolves an unmapped role's default page back to a path that role is denied on", () => {
    // Whatever getDefaultPageForRole returns for an unmapped role must not
    // itself be a path that canAccessRoute denies for that role — otherwise
    // proxy.ts loops between "denied -> redirect -> denied" forever.
    const target = getDefaultPageForRole(UNMAPPED_ROLE);
    expect(canAccessRoute(UNMAPPED_ROLE, target)).toBe(true);
  });

  it("denies non-public paths for a role that isn't in ROLE_ROUTE_PREFIXES", () => {
    expect(canAccessRoute(UNMAPPED_ROLE, "/dashboard")).toBe(false);
    expect(canAccessRoute(UNMAPPED_ROLE, "/settings")).toBe(false);
  });

  it("allows public paths regardless of role", () => {
    expect(canAccessRoute(UNMAPPED_ROLE, "/auth")).toBe(true);
    expect(canAccessRoute(null, "/auth")).toBe(true);
  });

  it("allows a known role's configured prefixes", () => {
    expect(canAccessRoute("DEV", "/dashboard")).toBe(true);
    expect(canAccessRoute("DEV", "/settings/users")).toBe(true);
  });
});
