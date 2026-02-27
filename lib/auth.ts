import { db } from "@/db/connection";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { sendEmail } from "./email.service";
import {
  account,
  rateLimit,
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

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    appUrl,
    "http://localhost:3554",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  secret: authSecret,
  url: appUrl,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      verification,
      account,
      rateLimit,
      session,
    },
  }),
  rateLimit: {
    window: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    storage: "database",
  },
  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          to: email,
          subject: "Your Magic Login Link",
          html: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #334155; margin: 0;">PRISM</h1>
    <p style="color: #6b7280; margin: 5px 0 0;">PPA Benchmarking Platform</p>
  </div>

  <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <h2 style="color: #1f2937; margin-top: 0;">Welcome to PRISM</h2>
    
    <p style="color: #4b5563; line-height: 1.6;">
      Hello,
    </p>
    
    <p style="color: #4b5563; line-height: 1.6;">
      To complete your login and gain access to the platform, please click the button below to verify your email address.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" 
         style="display: inline-block; background: #1e293b; color: white; 
                padding: 12px 24px; text-decoration: none; 
                border-radius: 6px; font-weight: bold; font-size: 16px;">
        Verify My Email
      </a>
    </div>

    <p style="color: #4b5563; line-height: 1.6;">
      This link will expire in <strong>15 minutes</strong> for security reasons.
    </p>

    <p style="color: #4b5563; line-height: 1.6;">
      If you did not create this account, please ignore this email.
    </p>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">
        Best regards,
      </p>
      <p style="color: #1f2937; font-weight: bold; margin: 5px 0 0;">
        The PRISM Team
      </p>
    </div>
  </div>

  <div style="text-align: center; margin-top: 20px;">
    <p style="color: #9ca3af; font-size: 12px;">
      This is an automated email. Please do not reply to this message.
    </p>
  </div>
</div>
          `,
        });
      },
    }),
  ],
});
