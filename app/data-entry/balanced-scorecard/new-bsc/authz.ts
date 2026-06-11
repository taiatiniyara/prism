import type { CurrentUser } from "@/lib/user.service";

// Reading a utility scorecard: utility builders + central oversight (DEV/BMO).
const READ_ROLES = new Set(["DEV", "BMO", "CEO", "EXE", "MGR", "BLO"]);

// Building/editing a utility's own scorecard overlay. Central roles (DEV/BMO)
// maintain the template, not individual utility scorecards.
const BUILD_ROLES = new Set(["CEO", "EXE", "MGR", "BLO"]);

// Maintaining the shared master template.
const TEMPLATE_ADMIN_ROLES = new Set(["DEV", "BMO"]);

// Editing the product-wide BSC styling theme (developers only).
const THEME_ADMIN_ROLES = new Set(["DEV"]);

export const canEditBscTheme = (user: CurrentUser): boolean =>
  !!user?.id && THEME_ADMIN_ROLES.has(user.role);

export const assertNewBscReadAccess = (user: CurrentUser): void => {
  if (!user?.id || !READ_ROLES.has(user.role)) {
    throw new Error("FORBIDDEN:You are not allowed to view this scorecard.");
  }
};

export const assertNewBscBuildAccess = (user: CurrentUser): void => {
  if (!user?.id || !BUILD_ROLES.has(user.role)) {
    throw new Error("FORBIDDEN:You are not allowed to build this scorecard.");
  }
};

export const assertNewBscTemplateAdminAccess = (user: CurrentUser): void => {
  if (!user?.id || !TEMPLATE_ADMIN_ROLES.has(user.role)) {
    throw new Error(
      "FORBIDDEN:You are not allowed to edit the BSC master template.",
    );
  }
};

export const assertNewBscThemeAdminAccess = (user: CurrentUser): void => {
  if (!canEditBscTheme(user)) {
    throw new Error("FORBIDDEN:Only developers can edit the BSC theme.");
  }
};
