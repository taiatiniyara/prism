import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/user.service";
import {
  assertNewBscBuildAccess,
  assertNewBscMasterLinkAccess,
  assertNewBscReadAccess,
  assertNewBscTemplateAdminAccess,
  assertNewBscThemeAdminAccess,
  canEditBscMasterLinks,
  canEditBscTheme,
} from "@/app/data-entry/balanced-scorecard/new-bsc/authz";

// Minimal stand-in: the gates only read `user?.id` and `user.role`.
const u = (role: string): CurrentUser =>
  ({ id: "u-1", role } as unknown as CurrentUser);
const noUser = null as unknown as CurrentUser;

const ALL_ROLES = ["DEV", "BMO", "CEO", "EXE", "MGR", "BLO", "EXT"] as const;

describe("new-bsc authz — read access (spec §9)", () => {
  // Utility builders + central oversight may read a scorecard.
  it.each(["DEV", "BMO", "CEO", "EXE", "MGR", "BLO"])("allows %s", (role) => {
    expect(() => assertNewBscReadAccess(u(role))).not.toThrow();
  });

  it("denies an outside (EXT) role", () => {
    expect(() => assertNewBscReadAccess(u("EXT"))).toThrow(/FORBIDDEN:/);
  });

  it("denies an unauthenticated user", () => {
    expect(() => assertNewBscReadAccess(noUser)).toThrow(/FORBIDDEN:/);
  });
});

describe("new-bsc authz — build access (spec §9, §13.5)", () => {
  // Only the utility builders edit their own overlay; DEV/BMO maintain the
  // template, not individual scorecards.
  it.each(["CEO", "EXE", "MGR", "BLO"])("allows %s", (role) => {
    expect(() => assertNewBscBuildAccess(u(role))).not.toThrow();
  });

  it.each(["DEV", "BMO", "EXT"])("denies %s", (role) => {
    expect(() => assertNewBscBuildAccess(u(role))).toThrow(/FORBIDDEN:/);
  });

  it("denies an unauthenticated user", () => {
    expect(() => assertNewBscBuildAccess(noUser)).toThrow(/FORBIDDEN:/);
  });
});

describe("new-bsc authz — template admin (spec §10)", () => {
  it.each(["DEV", "BMO"])("allows %s", (role) => {
    expect(() => assertNewBscTemplateAdminAccess(u(role))).not.toThrow();
  });

  it.each(["CEO", "EXE", "MGR", "BLO", "EXT"])("denies %s", (role) => {
    expect(() => assertNewBscTemplateAdminAccess(u(role))).toThrow(/FORBIDDEN:/);
  });
});

describe("new-bsc authz — master cause-effect links (spec §13.5, BMO only)", () => {
  it("only BMO may author master links", () => {
    expect(canEditBscMasterLinks(u("BMO"))).toBe(true);
    expect(() => assertNewBscMasterLinkAccess(u("BMO"))).not.toThrow();
  });

  it.each(ALL_ROLES.filter((r) => r !== "BMO"))("denies %s", (role) => {
    expect(canEditBscMasterLinks(u(role))).toBe(false);
    expect(() => assertNewBscMasterLinkAccess(u(role))).toThrow(/FORBIDDEN:/);
  });
});

describe("new-bsc authz — theme editing (developers only)", () => {
  it("only DEV may edit the BSC theme", () => {
    expect(canEditBscTheme(u("DEV"))).toBe(true);
    expect(() => assertNewBscThemeAdminAccess(u("DEV"))).not.toThrow();
  });

  it.each(ALL_ROLES.filter((r) => r !== "DEV"))("denies %s", (role) => {
    expect(canEditBscTheme(u(role))).toBe(false);
    expect(() => assertNewBscThemeAdminAccess(u(role))).toThrow(/FORBIDDEN:/);
  });
});
