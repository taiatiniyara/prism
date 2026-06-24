"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db/connection";
import { user } from "@/db/schema/auth-schema";
import { eq } from "drizzle-orm";

export async function resendVerificationEmail() {
  const requestHeaders = await headers();
  const headerEntries = Array.from(requestHeaders.entries());
  const session = await auth.api.getSession({
    headers: new Headers(headerEntries),
  });

  if (!session) {
    return { success: false, message: "Not authenticated." };
  }

  const [currentUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!currentUser) {
    return { success: false, message: "User not found." };
  }

  if (currentUser.emailVerified) {
    return { success: true, message: "Email is already verified." };
  }

  try {
    await auth.api.sendVerificationEmail({
      body: {
        email: currentUser.email,
        callbackURL: "/profile",
      },
      headers: new Headers(headerEntries),
    });

    return { success: true, message: "Verification email sent." };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to send email.",
    };
  }
}
