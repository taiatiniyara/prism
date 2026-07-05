import { db } from "@/db/connection";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { buildMagicLinkEmail, sendEmail } from "./email/email.service";
import {
  account,
  session,
  user,
  verification,
} from "@/db/schema/auth-schema";

const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret) {
  throw new Error("BETTER_AUTH_SECRET is not set.");
}

const rawAppUrl =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
if (!rawAppUrl) {
  throw new Error(
    "Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL to generate correct auth links.",
  );
}

// Normalize to include protocol for correct magic link generation
const appUrl = (() => {
  try {
    return new URL(rawAppUrl).toString();
  } catch {
    return new URL(`http://${rawAppUrl}`).toString();
  }
})();

const isProduction =
  process.env.NODE_ENV === "production" ||
  !rawAppUrl.includes("localhost");

const trustedOrigins = [appUrl];
if (!isProduction) {
  trustedOrigins.push(
    "http://localhost:3554",
    "http://localhost:3000",
    "http://localhost:3001",
  );
}

// Email verification is on by default; can be disabled for local/dev runs
// via AUTH_REQUIRE_EMAIL_VERIFICATION=false (never set this in production).
const requireEmailVerification =
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user: u, url }) => {
      const payload = buildMagicLinkEmail({ url });
      await sendEmail({
        to: u.email,
        subject: "Verify your PRISM account",
        html: payload.html,
      });
    },
  },
  trustedOrigins,
  secret: authSecret,
  url: appUrl,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      verification,
      account,
      session,
    },
  }),
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60, // Refresh session every hour of activity
  },
  accountLocking: {
    enabled: true,
    maxAttempts: 5,
    lockDuration: 15 * 60, // 15 minutes in seconds
    prefix: "account_lock",
  },
  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const payload = buildMagicLinkEmail({ url });

        await sendEmail({
          to: email,
          subject: payload.subject,
          html: payload.html,
        });
      },
    }),
  ],
});
