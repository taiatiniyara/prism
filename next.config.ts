import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["pg", "nodemailer", "dotenv", "node-cron"],
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
