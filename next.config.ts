import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  cacheComponents: true,
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
      };
    }
    return config;
  },
};

export default nextConfig;
