import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/user.service";

// The guide names live data-quality defects, so it must stay behind the same
// DEV/BMO boundary as the rest of the dictionary-curation tooling. proxy.ts
// only guards the /settings prefix (which BLO can also reach), so the role
// check lives here.
const GUIDE_ROLES = new Set(["DEV", "BMO"]);

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!GUIDE_ROLES.has(currentUser.role)) {
    return new NextResponse(
      "The KPI formula guide is available to DEV and BMO users only.",
      { status: 403 },
    );
  }

  // Served from docs/ so the repo copy stays the single source of truth; the
  // deploy pulls the full repo, so the file is always present at runtime.
  const filePath = path.join(process.cwd(), "docs", "kpi-formula-guide.html");
  const html = await fs.readFile(filePath, "utf8");

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
