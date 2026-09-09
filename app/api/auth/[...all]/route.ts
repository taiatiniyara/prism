import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { db } from "@/db/connection";
import { verification } from "@/db/schema/auth-schema";
import { eq } from "drizzle-orm";
import { tryWriteAuditLog } from "@/lib/logging/audit.service";

const { GET: baseGet, POST: basePost } = toNextJsHandler(auth);

// Magic-link tokens are stored plain in the `verification` table with the
// recipient's email in the JSON value. This lets us attribute a completed
// magic-link login (the /magic-link/verify redirect) to an email without
// having to decode the token.
async function lookupMagicLinkEmail(
  token: string,
): Promise<{ email?: string; name?: string } | null> {
  if (!token) return null;
  try {
    const [row] = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, token))
      .limit(1);
    if (!row) return null;
    try {
      return JSON.parse(row.value) as { email?: string; name?: string };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function isMagicLinkFailure(response: Response, requestUrl: URL): boolean {
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    return new URL(location, requestUrl.origin).searchParams.has("error");
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith("/magic-link/verify")) {
    const token = url.searchParams.get("token") ?? "";
    // Read the verification row BEFORE forwarding — Better Auth's
    // consumeVerificationValue deletes it atomically on success.
    const claim = await lookupMagicLinkEmail(token);
    const response = await baseGet(request);

    if (isMagicLinkFailure(response, url)) {
      const errorData = new URL(
        response.headers.get("location") ?? "/",
        url.origin,
      ).searchParams.get("error");
      await tryWriteAuditLog({
        action: "auth.login_failed",
        actorEmail: claim?.email ?? null,
        targetType: "user",
        details: {
          method: "magic_link",
          reason: errorData ?? "INVALID_TOKEN",
          tokenFound: claim !== null,
        },
      });
    } else {
      await tryWriteAuditLog({
        action: "auth.login",
        actorEmail: claim?.email ?? null,
        targetType: "user",
        details: { method: "magic_link", newUser: claim?.name !== undefined },
      });
    }
    return response;
  }

  return baseGet(request);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith("/sign-in/email")) {
    const cloned = request.clone();
    let body: { email?: unknown } | null = null;
    try {
      body = (await cloned.json()) as { email?: unknown };
    } catch {
      body = null;
    }

    const response = await basePost(request);

    if (response.ok) {
      const data = (await response
        .clone()
        .json()
        .catch(() => null)) as { user?: { id?: string; email?: string } } | null;
      const user = data?.user;
      await tryWriteAuditLog({
        action: "auth.login",
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        targetType: "user",
        targetId: user?.id ?? null,
        details: { method: "password" },
      });
    } else {
      const errData = (await response
        .clone()
        .json()
        .catch(() => null)) as { message?: string; code?: string } | null;
      await tryWriteAuditLog({
        action: "auth.login_failed",
        actorEmail:
          typeof body?.email === "string" ? body.email : null,
        targetType: "user",
        details: {
          method: "password",
          reason:
            errData?.message ?? errData?.code ?? "INVALID_EMAIL_OR_PASSWORD",
        },
      });
    }
    return response;
  }

  if (path.endsWith("/sign-out")) {
    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    const response = await basePost(request);

    if (response.ok && session?.user) {
      await tryWriteAuditLog({
        action: "auth.logout",
        actorUserId: session.user.id,
        actorEmail: session.user.email,
        targetType: "user",
        targetId: session.user.id,
      });
    }
    return response;
  }

  return basePost(request);
}