import { db } from "@/drizzle/connection";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { sendEmail } from "./email.service";
import { account, rateLimit, session, user, verification } from "@/drizzle/schema/auth-schema";

const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret) {
    throw new Error("BETTER_AUTH_SECRET is not set.");
}

const appUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
if (!appUrl) {
    throw new Error("Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL to generate correct auth links.");
}

export const auth = betterAuth({
    secret: authSecret,
    url: appUrl,
    database: drizzleAdapter(db, {
        provider: "pg", // or "pg" or "mysql"
        schema: {
            user,
            verification,
            account,
            rateLimit,
            session
        }
    }),
    rateLimit: {
        window: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        storage: "database"
    },
    plugins: [
        nextCookies(),
        magicLink({
            sendMagicLink: async ({ email, url }) => {
                await sendEmail({
                    to: email,
                    subject: "Your Magic Login Link",
                    html: `Click <a href="${url}">here</a> to log in. This link will expire in 15 minutes.`,
                })
            }
        })
    ]
});