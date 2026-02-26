"use server";

import { db } from "@/db/connection";
import { user } from "@/db/schema/auth-schema";
import { authClient } from "@/lib/auth-client";
import { eq } from "drizzle-orm";

export async function sendMagicLink(email: string) {
  const checkUser = await db.select().from(user).where(eq(user.email, email));
  if (checkUser.length === 0) {
    return { success: false, message: "User not found" };
  }

  await authClient.signIn.magicLink({
    email,
    callbackURL: "/dashboard",
  });

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
}) {
  const sent = await authClient.signUp.email({
    email: data.email,
    name: `${data.firstName} ${data.lastName}`,
    password: "",
  });

  if (sent.error) {
    return { error: sent.error };
  }

  const u = sent.data?.user;

  if (u) {
    await db.update(user).set({
      name: `${data.firstName} ${data.lastName}`,
      organisation_id: data.organisationId,
      data_access_reason: data.dataAccessReason,
      dataset_required: data.datasetsRequired,
    });
  }

  return sent;
}
