"use server";

import { db } from "@/db/connection";
import { user } from "@/db/schema/auth-schema";
import { authClient } from "@/lib/auth-client";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

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
  if (checkUser.length === 0) {
    return {
      success: false,
      message: "You don't have an account yet. Please register first.",
    };
  }

  const forwardedHeaders = await getForwardedAuthHeaders();

  await authClient.signIn.magicLink(
    {
      email,
      callbackURL: "/dashboard",
    },
    {
      headers: forwardedHeaders,
    },
  );

  return {
    success: true,
    message: "Magic link sent successfully",
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
        password: "Password#123",
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
