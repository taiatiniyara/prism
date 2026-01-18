import { db } from "@/drizzle/connection";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { sendEmail } from "./email.service";

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
        provider: "pg", // or "pg" or "mysql"
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