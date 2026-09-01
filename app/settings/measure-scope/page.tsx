import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user.service";
import { getMeasureScopeViewModel } from "./service";
import MeasureDimensionScopeEditor from "./scope-editor.client";

export default async function MeasureScopePage() {
  const user = await getCurrentUser();
  if (user.role !== "DEV") redirect("/settings");

  const model = await getMeasureScopeViewModel();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Measure Dimension Scope</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure which dimensions apply to each measure. Unchecked dimensions
          will auto-fill with their {"All"} value during data entry.
        </p>
      </div>

      <MeasureDimensionScopeEditor
        rows={model.rows}
        allDimensions={model.allDimensions}
      />
    </div>
  );
}
