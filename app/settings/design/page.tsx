import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/user.service";
import DesignTokensEditor from "@/components/settings/design-tokens-editor";

export default async function DesignSettingsPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user?.role !== "DEV") redirect("/settings");
  return <DesignTokensEditor />;
}
