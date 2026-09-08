import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  getDefaultPageForRole,
  ROLE_DEFAULT_PAGES,
  ROLE_ROUTE_PREFIXES,
} from "@/lib/role-guard";

// A role known to exist in the `roles` table but that still has no entry in
// ROLE_ROUTE_PREFIXES / ROLE_DEFAULT_PAGES, used to exercise the "unmapped
// role" fallback behaviour. Kept distinct from AFM, which is now mapped
// (interim /dashboard-only access) below.
const UNMAPPED_ROLE = "CON";

describe("role-guard", () => {
  it("returns the configured default page for a known role", () => {
    expect(getDefaultPageForRole("DEV")).toBe("/dashboard");
    expect(getDefaultPageForRole("MGR")).toBe("/data-entry");
  });

  it("grants AFM interim dashboard access", () => {
    // AFM previously had no entry at all, which caused an infinite redirect
    // loop in proxy.ts once an AFM session existed. Granted the same
    // minimal view-only baseline as EXE/EXT as an interim fix.
    expect(getDefaultPageForRole("AFM")).toBe("/dashboard");
    expect(canAccessRoute("AFM", "/dashboard")).toBe(true);
    expect(canAccessRoute("AFM", "/profile")).toBe(true);
    expect(canAccessRoute("AFM", "/settings")).toBe(false);
    expect(canAccessRoute("AFM", "/data-entry")).toBe(false);
  });

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
