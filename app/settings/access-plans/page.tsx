import { getCurrentUser } from "@/lib/user.service";
import AccessPlansClient from "./access-plans-client";

// Access Plans (Tiered Access) — DEV/BMO admin surface. PROTOTYPE: the plan model
// (#10) + DDL (#2) are not built yet, so this reads a mock seed and edits are
// in-session only. Editing is gated to DEV/BMO; other roles see it read-only.
export default async function AccessPlansPage() {
  const user = await getCurrentUser();
  const canEdit = user.role === "DEV" || user.role === "BMO";
  return <AccessPlansClient canEdit={canEdit} />;
}
