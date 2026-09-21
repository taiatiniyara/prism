import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: false,
  serverExternalPackages: [
    "pg",
    "pg-connection-string",
    "pgpass",
    "split2",
    "nodemailer",
    "dotenv",
    "node-cron",
    "fstream",
  ],
  outputFileTracingRoot: projectRoot,
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.powerbi.com"
      : "script-src 'self' 'unsafe-inline' https://app.powerbi.com";

    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://api.powerbi.com https://login.microsoftonline.com" +
              (process.env.NEXT_PUBLIC_APP_URL ? ` ${process.env.NEXT_PUBLIC_APP_URL}` : ""),
              "frame-src https://app.powerbi.com",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            // HTTPS-only enforcement. 2 years; applies to subdomains
            // (dev./prismdashboard.org). `preload` intentionally omitted for
            // now — only add it once every subdomain is confirmed HTTPS-only,
            // as preload is hard to reverse.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        stream: false,
        crypto: false,
        http: false,
        https: false,
        net: false,
        tls: false,
        dns: false,
        zlib: false,
        os: false,
        url: false,
        string_decoder: false,
        path: false,
        events: false,
        util: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
