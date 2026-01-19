import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

const baseUrl = process.env.BETTER_AUTH_URL;

if (!baseUrl) {
    throw new Error("BETTER_AUTH_URL is not set.");
}

console.log("Auth Client Base URL:", baseUrl);

export const authClient = createAuthClient({
    baseURL: baseUrl,
    plugins: [
        magicLinkClient()
    ]
});