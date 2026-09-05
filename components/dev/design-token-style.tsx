import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { uiStyleOverride } from "@/db/schema/ui-style";
import { generateTokenCss, sanitizeDesignTokens } from "@/lib/design-tokens";

// Injects any DEV-set design-token overrides as a late :root stylesheet (server-
// rendered, so no flash). Applies for everyone; empty when nothing is overridden.
export default async function DesignTokenStyle() {
  let css = "";
  try {
    const [row] = await db
      .select({ styles: uiStyleOverride.styles })
      .from(uiStyleOverride)
      .where(eq(uiStyleOverride.scope, "design-tokens"))
      .limit(1);
    css = generateTokenCss(sanitizeDesignTokens(row?.styles));
  } catch {
    css = "";
  }
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
