import { cache } from "react";
import { cacheTag } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/connection";
import { roles, user } from "@/drizzle/schema/auth-schema";
import { auth } from "./auth";

type HeaderEntries = [string, string][];

const getSessionCached = cache(async (headerEntries: HeaderEntries) => {
    "use cache";
    cacheTag("session");

    const data = await auth.api.getSession({
        headers: new Headers(headerEntries),
    });

    const session = data?.session || null;
    if (!session) {
        return null;
    }

    const [currentUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, session.userId));

    if (!currentUser || !currentUser.role_id) {
        return null;
    }

    const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, currentUser.role_id))
        .limit(1);

    if (!role) {
        return null;
    }

    return {
        session,
        user: currentUser,
        role: role,
    };
});

export async function getSession() {
    // Capture dynamic headers outside the cached scope; pass them into the cached function.
    const requestHeaders = await headers();
    const headerEntries = Array.from(requestHeaders.entries());
    return getSessionCached(headerEntries);
}