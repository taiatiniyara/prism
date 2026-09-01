import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { uiStyleOverride } from "@/db/schema/ui-style";
import { getCurrentUser } from "@/lib/user.service";
import { sanitizeUiStyles } from "@/lib/ui-style";

const GLOBAL = "global";

const readStyles = async () => {
  const [row] = await db
    .select({ styles: uiStyleOverride.styles })
    .from(uiStyleOverride)
    .where(eq(uiStyleOverride.scope, GLOBAL))
    .limit(1);
  return row?.styles ?? {};
};

export async function GET() {
  // Styles are applied for everyone; canEdit gates the editor UI (DEV only).
  let canEdit = false;
  try {
    const user = await getCurrentUser();
    canEdit = user?.role === "DEV";
  } catch {
    canEdit = false;
  }

  try {
    const styles = await readStyles();
    return Response.json({ styles, canEdit });
  } catch {
    return Response.json({ styles: {}, canEdit });
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
      { message: "Only developers can edit UI styling." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as { styles?: unknown };
    const styles = sanitizeUiStyles(body?.styles);
    await db
      .insert(uiStyleOverride)
      .values({ scope: GLOBAL, styles, updated_by_id: user.id })
      .onConflictDoUpdate({
        target: uiStyleOverride.scope,
        set: { styles, updated_by_id: user.id, updated_at: new Date() },
      });
    return Response.json({ message: "UI styling saved." });
  } catch {
    return Response.json(
      { message: "Unable to save UI styling." },
      { status: 500 },
    );
  }
}
