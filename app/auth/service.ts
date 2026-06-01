"use server";

import { db } from "@/db/connection";
import { user } from "@/db/schema/auth-schema";
import { authClient } from "@/lib/auth-client";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import crypto from "node:crypto";

const getForwardedAuthHeaders = async () => {
  const headersList = await headers();

  return {
    origin: headersList.get("origin") ?? "",
    host: headersList.get("host") ?? "",
    "x-forwarded-host": headersList.get("x-forwarded-host") ?? "",
    cookie: headersList.get("cookie") ?? "",
  };
};

export async function sendMagicLink(email: string) {
  const checkUser = await db.select().from(user).where(eq(user.email, email));

  const forwardedHeaders = await getForwardedAuthHeaders();

  if (checkUser.length > 0) {
    await authClient.signIn.magicLink(
      {
        email,
        callbackURL: "/dashboard",
      },
      {
        headers: forwardedHeaders,
      },
    );
  }

  return {
    success: true,
    message: "If an account exists for this email, a magic link has been sent.",
  };
}

export async function registerUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  datasetsRequired: string;
  dataAccessReason: string;
  organisationId: number;
  roleId: number;
}) {
  let sent = false;
  try {
    const forwardedHeaders = await getForwardedAuthHeaders();

    const s = await authClient.signUp.email(
      {
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
        password: crypto.randomUUID() + crypto.randomBytes(16).toString("hex"),
        callbackURL: "/",
      },
      {
        headers: forwardedHeaders,
      },
    );

    const u = s.data?.user;

    if (u) {
      await db
        .update(user)
        .set({
          name: `${data.firstName} ${data.lastName}`,
          organisation_id: data.organisationId,
          data_access_reason: data.dataAccessReason,
          dataset_required: data.datasetsRequired,
          status: "pending",
          role_id: data.roleId,
        })
        .where(eq(user.id, u.id));
    }

    await authClient.signIn.magicLink(
      {
        email: data.email,
        callbackURL: "/dashboard",
      },
      {
        headers: forwardedHeaders,
      },
    );

    sent = true;
  } catch (error) {
    console.error("[auth] registerUser failed", error);
    sent = false;
  }

  return sent;
}
