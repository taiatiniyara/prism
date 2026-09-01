import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET() {
  const html = readFileSync(join(process.cwd(), "public", "docs", "api", "index.html"), "utf-8");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
