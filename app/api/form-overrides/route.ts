import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { uiStyleOverride } from "@/db/schema/ui-style";
import { getCurrentUser } from "@/lib/user.service";
import {
  sanitizeFormOverrides,
  type FormOverrideMap,
} from "@/lib/form-overrides";

// Persisted in the existing ui_style_override table under a dedicated scope, so no
// new table/DDL. The `styles` JSON column holds the FormOverrideMap for this scope
// (cast at the boundary — the column is generic JSON on disk).
const SCOPE = "form-overrides";

const readOverrides = async (): Promise<FormOverrideMap> => {
  const [row] = await db
    .select({ styles: uiStyleOverride.styles })
    .from(uiStyleOverride)
    .where(eq(uiStyleOverride.scope, SCOPE))
    .limit(1);
  return sanitizeFormOverrides(row?.styles);
};

export async function GET() {
  // Overrides apply for everyone; canEdit gates the editor UI (DEV only).
  let canEdit = false;
  try {
    const user = await getCurrentUser();
    canEdit = user?.role === "DEV";
  } catch {
    canEdit = false;
  }
  try {
    const overrides = await readOverrides();
    return Response.json({ overrides, canEdit });
  } catch {
    return Response.json({ overrides: {}, canEdit });
  }
}

export async function PUT(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (user?.role !== "DEV") {
    return Response.json(
      { message: "Only developers can edit form labels." },
      { status: 403 },
    );
  }
  try {
    const body = (await request.json()) as { overrides?: unknown };
    const overrides = sanitizeFormOverrides(body?.overrides);
    await db
      .insert(uiStyleOverride)
      .values({
        scope: SCOPE,
        // generic JSON column; this scope stores a FormOverrideMap
        styles: overrides as unknown as (typeof uiStyleOverride.$inferInsert)["styles"],
        updated_by_id: user.id,
      })
      .onConflictDoUpdate({
        target: uiStyleOverride.scope,
        set: {
          styles: overrides as unknown as (typeof uiStyleOverride.$inferInsert)["styles"],
          updated_by_id: user.id,
          updated_at: new Date(),
        },
      });
    return Response.json({ message: "Form labels saved." });
  } catch {
    return Response.json(
      { message: "Unable to save form labels." },
      { status: 500 },
    );
  }
}
