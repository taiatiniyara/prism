import type { CurrentUser } from "@/lib/user.service";

const READ_ROLES = new Set(["DEV", "BMO", "BLO"]);
const WRITE_ROLES = new Set(["DEV", "BMO", "BLO"]);

export const assertScorecardReadAccess = (user: CurrentUser): void => {
  if (!user?.id) {
    throw new Error("FORBIDDEN:You are not allowed to access scorecard data.");
  }

  if (!READ_ROLES.has(user.role)) {
    throw new Error("FORBIDDEN:You are not allowed to access scorecard data.");
  }
};

export const assertScorecardWriteAccess = (user: CurrentUser): void => {
  if (!user?.id || !WRITE_ROLES.has(user.role)) {
    throw new Error("FORBIDDEN:You are not allowed to update scorecard data.");
  }
};
