import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { eq } from "drizzle-orm";

// Shared by proxy.ts (route-access gating) and lib/user.service.ts
// (getCurrentUser, called from ~40 API route handlers). Each page
// navigation fires several API calls that previously each re-verified the
// session and re-queried `user` + `roles` independently; this cache lets
// requests landing within the TTL window reuse the same DB result instead
// of hitting Postgres again.
const CACHE_TTL_MS = 5000;

type CachedUserAndRole = {
  user: typeof user.$inferSelect;
  roleName: string | null;
  ts: number;
};

const cache = new Map<string, CachedUserAndRole>();

export async function getCachedUserAndRole(
  userId: string,
): Promise<{ user: typeof user.$inferSelect; roleName: string | null } | null> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return { user: cached.user, roleName: cached.roleName };
  }

  const [fetchedUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!fetchedUser) {
    cache.delete(userId);
    return null;
  }

  let roleName: string | null = null;
  if (fetchedUser.role_id) {
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, fetchedUser.role_id))
      .limit(1);
    roleName = role?.name ?? null;
  }

  cache.set(userId, { user: fetchedUser, roleName, ts: now });

  // Opportunistic eviction of expired entries so the map doesn't grow
  // unbounded across the lifetime of the server process.
  if (cache.size > 500) {
    for (const [key, entry] of cache) {
      if (now - entry.ts >= CACHE_TTL_MS) {
        cache.delete(key);
      }
    }
  }

  return { user: fetchedUser, roleName };
}

// Call after a write that changes a user's role or profile so the next
// read isn't served stale data for up to CACHE_TTL_MS.
export function invalidateUserCache(userId: string) {
  cache.delete(userId);
}
