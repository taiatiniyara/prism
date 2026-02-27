import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;

if (!baseUrl) {
  throw new Error("BETTER_AUTH_URL is not set.");
}

export const authClient = createAuthClient({
  baseURL: baseUrl,
  plugins: [magicLinkClient()],
});
