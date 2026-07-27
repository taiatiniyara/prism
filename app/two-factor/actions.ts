"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db/connection";
import { session as sessionTable } from "@/db/schema/auth-schema";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

type Result = { ok: boolean; error?: string };

/**
 * Verify a TOTP (or backup) code SERVER-SIDE and, only on success, stamp the
 * current session as having passed the admin MFA challenge.
 *
 * Verification and marking happen together, here, on the server — a client can
 * never mark a session verified without presenting a code that better-auth
 * validates against the stored (encrypted) secret. This is the single point
 * that grants a session its `two_factor_verified_at`; nothing else sets it.
 *
 * On the first successful TOTP verification the better-auth plugin also flips
 * `user.twoFactorEnabled` to true, which completes enrolment.
 */
export async function verifyAndMarkTwoFactor(
  code: string,
  useBackupCode = false,
): Promise<Result> {
  const hdrs = await headers();
  const current = await auth.api.getSession({ headers: hdrs });
  if (!current) return { ok: false, error: "You are not signed in." };

  const trimmed = (code ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter your code." };

  try {
    if (useBackupCode) {
      await auth.api.verifyBackupCode({
        body: { code: trimmed },
        headers: hdrs,
      });
    } else {
      await auth.api.verifyTOTP({ body: { code: trimmed }, headers: hdrs });
    }
  } catch {
    return {
      ok: false,
      error: "That code was not valid. Please try again.",
    };
  }

  await db
    .update(sessionTable)
    .set({ twoFactorVerifiedAt: new Date() })
    .where(eq(sessionTable.id, current.session.id));

  return { ok: true };
}
