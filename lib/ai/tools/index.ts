import type { CurrentUser } from "@/lib/user.service";
import { createPrismNativeTools } from "./prism-native";
import { createPowerBiTools } from "./power-bi";
import {
  DEFAULT_AI_PRIMARY_SOURCE,
  secondaryOf,
  type AiPrimarySource,
  type AiSecondarySource,
} from "../source-setting-constants";

// The gold-layer performance tools (read gold.fact_kpi) — the web-app "source".
const GOLD_PERF_TOOLS = new Set<string>([
  "compare_kpis_across_utilities",
  "get_kpi_targets",
  "get_compliance_status",
  "get_kpi_correlation",
  "get_data_quality_report",
  "get_what_changed",
]);

export const createAiTools = (
  user: CurrentUser,
  abortSignal?: AbortSignal,
  sessionId?: number,
  primary: AiPrimarySource = DEFAULT_AI_PRIMARY_SOURCE,
  secondary: AiSecondarySource = secondaryOf(primary),
) => {
  const native = createPrismNativeTools(user, abortSignal, sessionId, primary);
  const pbi = createPowerBiTools(user, abortSignal, sessionId, primary);
  const all = { ...native, ...pbi };

  // Isolation mode (no secondary): physically remove the non-primary source's
  // performance tools so the model genuinely cannot reach it — soft prompt-steering
  // alone can leak. Non-source utility tools (config, explain, worldbank, submission
  // status) stay available regardless.
  if (secondary === "none") {
    const drop =
      primary === "webapp"
        ? new Set<string>(Object.keys(pbi)) // gold-only → drop all Power BI tools
        : GOLD_PERF_TOOLS; // powerbi-only → drop the gold-layer performance tools
    const kept = Object.fromEntries(
      Object.entries(all).filter(([name]) => !drop.has(name)),
    );
    return kept as typeof all;
  }

  return all;
};

export type AiTools = ReturnType<typeof createAiTools>;
