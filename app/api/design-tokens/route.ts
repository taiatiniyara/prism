import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { uiStyleOverride } from "@/db/schema/ui-style";
import { getCurrentUser } from "@/lib/user.service";
import {
  sanitizeDesignTokens,
  type DesignTokenMap,
} from "@/lib/design-tokens";

// Persisted in the existing ui_style_override table under a dedicated scope, so no
// new table/DDL. The `styles` JSON column holds the DesignTokenMap for this scope.
const SCOPE = "design-tokens";

const readTokens = async (): Promise<DesignTokenMap> => {
  const [row] = await db
    .select({ styles: uiStyleOverride.styles })
    .from(uiStyleOverride)
    .where(eq(uiStyleOverride.scope, SCOPE))
    .limit(1);
  return sanitizeDesignTokens(row?.styles);
};

export async function GET() {
  let canEdit = false;
  try {
    const user = await getCurrentUser();
    canEdit = user?.role === "DEV";
  } catch {
    canEdit = false;
  }
  try {
    const tokens = await readTokens();
    return Response.json({ tokens, canEdit });
  } catch {
    return Response.json({ tokens: {}, canEdit });
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
      { message: "Only developers can edit design tokens." },
      { status: 403 },
    );
  }
  try {
    const body = (await request.json()) as { tokens?: unknown };
    const tokens = sanitizeDesignTokens(body?.tokens);
    await db
      .insert(uiStyleOverride)
      .values({
        scope: SCOPE,
        styles: tokens as unknown as (typeof uiStyleOverride.$inferInsert)["styles"],
        updated_by_id: user.id,
      })
      .onConflictDoUpdate({
        target: uiStyleOverride.scope,
        set: {
          styles:
            tokens as unknown as (typeof uiStyleOverride.$inferInsert)["styles"],
          updated_by_id: user.id,
          updated_at: new Date(),
        },
      });
    return Response.json({ message: "Design tokens saved." });
  } catch {
    return Response.json(
      { message: "Unable to save design tokens." },
      { status: 500 },
    );
  }
}
