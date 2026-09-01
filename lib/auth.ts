import { db } from "@/db/connection";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor as twoFactorPlugin } from "better-auth/plugins";
import { buildMagicLinkEmail, sendEmail } from "./email/email.service";
import {
  account,
  session,
  twoFactor,
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

// Email verification is on by default. The AUTH_REQUIRE_EMAIL_VERIFICATION=false
// escape hatch is honoured ONLY outside production; in production it is always
// enforced, so an accidental or hostile env override cannot silently disable it.
const requireEmailVerification = isProduction
  ? true
  : process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false";
if (isProduction && process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "false") {
  console.warn(
    "[auth] AUTH_REQUIRE_EMAIL_VERIFICATION=false is ignored in production; email verification stays enforced.",
  );
}

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
      twoFactor,
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
    // TOTP two-factor. `allowPasswordless` lets magic-link users (who have no
    // password) enrol without one. NOTE: this plugin only challenges credential
    // sign-in; PRISM's magic-link login is enforced separately in proxy.ts,
    // which requires admins (BMO/DEV) to pass a TOTP challenge per session.
    twoFactorPlugin({
      issuer: "PRISM",
      allowPasswordless: true,
    }),
    // nextCookies must be the LAST plugin so it can attach Set-Cookie headers.
    nextCookies(),
  ],
});
