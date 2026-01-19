"use server";

import { authClient } from "@/lib/auth-client";

export async function sendMagicLink(email: string) {
    const sent = await authClient.signIn.magicLink({
        email,
        callbackURL: "/dashboard",
    })

    return sent;
}