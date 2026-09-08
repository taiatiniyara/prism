import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  getDefaultPageForRole,
  ROLE_DEFAULT_PAGES,
  ROLE_ROUTE_PREFIXES,
} from "@/lib/role-guard";

describe("role-guard", () => {
  it("returns the configured default page for a known role", () => {
    expect(getDefaultPageForRole("DEV")).toBe("/dashboard");
    expect(getDefaultPageForRole("MGR")).toBe("/data-entry");
  });

  it("returns /auth for a role with no route access configured", () => {
    // AFM exists in the `roles` table but has never been added to
    // ROLE_ROUTE_PREFIXES / ROLE_DEFAULT_PAGES. Falling back to "/dashboard"
    // here previously caused proxy.ts to redirect-loop forever, since
    // canAccessRoute("AFM", "/dashboard") is also always false. Regression
    // test for that bug.
    expect(ROLE_ROUTE_PREFIXES["AFM"]).toBeUndefined();
    expect(ROLE_DEFAULT_PAGES["AFM"]).toBeUndefined();
    expect(getDefaultPageForRole("AFM")).toBe("/auth");
  });

  it("returns /auth when the user has no role at all", () => {
    expect(getDefaultPageForRole(null)).toBe("/auth");
    expect(getDefaultPageForRole(undefined)).toBe("/auth");
  });

  it("never resolves an unmapped role's default page back to a path that role is denied on", () => {
    // Whatever getDefaultPageForRole returns for an unmapped role must not
    // itself be a path that canAccessRoute denies for that role — otherwise
    // proxy.ts loops between "denied -> redirect -> denied" forever.
    const unmappedRole = "AFM";
    const target = getDefaultPageForRole(unmappedRole);
    expect(canAccessRoute(unmappedRole, target)).toBe(true);
  });

  it("denies every path for a role that isn't in ROLE_ROUTE_PREFIXES", () => {
    expect(canAccessRoute("AFM", "/dashboard")).toBe(false);
    expect(canAccessRoute("AFM", "/settings")).toBe(false);
  });

  it("allows a known role's configured prefixes", () => {
    expect(canAccessRoute("DEV", "/dashboard")).toBe(true);
    expect(canAccessRoute("DEV", "/settings/users")).toBe(true);
  });
});
