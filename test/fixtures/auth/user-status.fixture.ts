import type { UserStatus } from "@/db/schema/auth-schema";

export function buildUserStatusFixture(overrides?: {
  status?: UserStatus;
  rejectReason?: string | null;
}) {
  return {
    status: overrides?.status ?? ("pending" as UserStatus),
    rejectReason: overrides?.rejectReason ?? null,
  };
}
