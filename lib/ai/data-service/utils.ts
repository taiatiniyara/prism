import { db } from "@/db/connection";
import { aiReviewQueue } from "@/db/schema/ai";
import { kpiDefinitions } from "@/db/schema/kpi";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { like, inArray } from "drizzle-orm";
import { desc } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";
import { logger } from "@/lib/logging/logger";

// ---- CIRCUIT BREAKER ----

const toolFailures = new Map<
  string,
  { count: number; lastFail: number; cooldownUntil: number }
>();
const MAX_FAILURES = 5;
const COOLDOWN_MS = 60000;

export const recordToolFailure = (toolName: string): boolean => {
  const now = Date.now();
  const entry = toolFailures.get(toolName) ?? {
    count: 0,
    lastFail: 0,
    cooldownUntil: 0,
  };

  if (now < entry.cooldownUntil) {
    logger.warn("[ai-circuit-breaker] Tool in cooldown", {
      toolName,
      cooldownUntil: new Date(entry.cooldownUntil).toISOString(),
    });
    return false;
  }

  entry.count++;
  entry.lastFail = now;

  if (entry.count >= MAX_FAILURES) {
    entry.cooldownUntil = now + COOLDOWN_MS;
    entry.count = 0;
    logger.error("[ai-circuit-breaker] Tool circuit opened", {
      toolName,
      failures: MAX_FAILURES,
      cooldownMs: COOLDOWN_MS,
    });
    return false;
  }

  toolFailures.set(toolName, entry);
  logger.warn("[ai-circuit-breaker] Tool failure recorded", {
    toolName,
    failureCount: entry.count,
    maxFailures: MAX_FAILURES,
  });
  return true;
};

export const resetToolCircuit = (toolName: string): void => {
  toolFailures.delete(toolName);
  logger.info("[ai-circuit-breaker] Tool circuit reset", { toolName });
};

export const getCircuitStatus = (): Array<{
  toolName: string;
  failures: number;
  cooldownUntil: number | null;
}> => {
  const now = Date.now();
  return [...toolFailures.entries()].map(([toolName, entry]) => ({
    toolName,
    failures: entry.count,
    cooldownUntil: entry.cooldownUntil > now ? entry.cooldownUntil : null,
  }));
};

// ---- REVIEW QUEUE VIEWING ----

export interface ReviewQueueEntry {
  id: number;
  turn_id: number;
  sentiment: string;
  correction_text: string | null;
  status: string;
  created_at: string;
}

export interface ReviewQueueViewData {
  entries: ReviewQueueEntry[];
  total_pending: number;
  total_reviewed: number;
}

export const getReviewQueueEntries = async (
  user: CurrentUser,
): Promise<AiToolResult<ReviewQueueViewData>> => {
  if (user.role !== "DEV" && user.role !== "BMO") {
    return {
      data: { entries: [], total_pending: 0, total_reviewed: 0 },
      metadata: createToolMetadata({ source: "ai_review_queue" }),
      error: "Only administrators can view the AI review queue.",
    };
  }

  const entries = await db
    .select({
      id: aiReviewQueue.id,
      turnId: aiReviewQueue.turn_id,
      flaggedReason: aiReviewQueue.flagged_reason,
      decision: aiReviewQueue.decision,
      createdAt: aiReviewQueue.created_at,
    })
    .from(aiReviewQueue)
    .orderBy(desc(aiReviewQueue.created_at))
    .limit(100);

  const mapped: ReviewQueueEntry[] = entries.map((e) => ({
    id: e.id,
    turn_id: e.turnId,
    sentiment: "negative",
    correction_text: e.flaggedReason ?? null,
    status: e.decision ?? "pending",
    created_at: e.createdAt?.toISOString() ?? "",
  }));

  const pending = mapped.filter((e) => e.status === "pending").length;

  return {
    data: {
      entries: mapped,
      total_pending: pending,
      total_reviewed: mapped.length - pending,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      source: "ai_review_queue",
    }),
  };
};

// ---- GUIDED DATA ENTRY ----

export interface GuidedEntryStep {
  step: number;
  input_name: string;
  measure_def_id: number | null;
  description: string;
  current_value: string | null;
  required: boolean;
  formula_variable: string | null;
  example: string | null;
}

export interface GuidedEntryData {
  kpi_name: string;
  steps: GuidedEntryStep[];
  total_steps: number;
  completed_steps: number;
  message: string;
}

export const getGuidedEntry = async (
  user: CurrentUser,
  options: { kpi_name: string } = { kpi_name: "" },
): Promise<AiToolResult<GuidedEntryData>> => {
  const kpiName = options.kpi_name?.trim();
  if (!kpiName) {
    return {
      data: {
        kpi_name: "",
        steps: [],
        total_steps: 0,
        completed_steps: 0,
        message:
          "No KPI name provided. Please specify a KPI name for data entry guidance.",
      },
      metadata: createToolMetadata({ source: "data_entry" }),
    };
  }

  try {
    const defs = await db
      .select({
        id: kpiDefinitions.id,
        name: kpiDefinitions.name,
        formula: kpiDefinitions.formula,
      })
      .from(kpiDefinitions)
      .where(like(kpiDefinitions.name, `%${kpiName}%`))
      .limit(5);

    if (defs.length === 0) {
      return {
        data: {
          kpi_name: kpiName,
          steps: [],
          total_steps: 0,
          completed_steps: 0,
          message: `No KPI definition found matching "${kpiName}". Try using get_kpi_status or explain_kpi to find the correct KPI name first.`,
        },
        metadata: createToolMetadata({ source: "data_entry" }),
      };
    }

    const allSteps: GuidedEntryStep[] = [];
    const inputDefIds = new Set<number>();

    for (const def of defs) {
      if (def.formula && Array.isArray(def.formula)) {
        for (const fi of def.formula as Array<{ measure_def_id?: number }>) {
          if (fi.measure_def_id) inputDefIds.add(fi.measure_def_id);
        }
      }
    }

    const inputs =
      inputDefIds.size > 0
        ? await db
            .select({
              id: measureDefinitions.id,
              name: measureDefinitions.name,
              description: measureDefinitions.description,
              variable_name: measureDefinitions.variable_name,
            })
            .from(measureDefinitions)
            .where(inArray(measureDefinitions.id, [...inputDefIds]))
            .limit(50)
        : [];

    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      allSteps.push({
        step: allSteps.length + 1,
        input_name: inp.name || `Input ${i + 1}`,
        measure_def_id: inp.id,
        description:
          inp.description ||
          `Enter a value for ${inp.name || inp.variable_name || `input ${i + 1}`}`,
        current_value: null,
        required: true,
        formula_variable: inp.variable_name,
        example: null,
      });
    }

    if (allSteps.length === 0) {
      return {
        data: {
          kpi_name: defs[0].name,
          steps: [],
          total_steps: 0,
          completed_steps: 0,
          message: `"${defs[0].name}" has no formula inputs defined directly. It may be a composite KPI calculated from other KPIs. Try using explain_kpi to understand how it's computed, then enter data for its component KPIs via /data-entry/enter-data.`,
        },
        metadata: createToolMetadata({ source: "data_entry" }),
      };
    }

    return {
      data: {
        kpi_name: defs[0].name,
        steps: allSteps,
        total_steps: allSteps.length,
        completed_steps: 0,
        message: `Found ${allSteps.length} input${allSteps.length !== 1 ? "s" : ""} for "${defs[0].name}". Navigate to /data-entry/enter-data to fill in these values. Use get_input_status to check which inputs are already filled.`,
      },
      metadata: createToolMetadata({
        source: "data_entry",
        freshness: new Date(),
      }),
    };
  } catch {
    return {
      data: {
        kpi_name: kpiName,
        steps: [],
        total_steps: 0,
        completed_steps: 0,
        message: `Failed to load input definitions for "${kpiName}". Navigate to /data-entry/enter-data in PRISM to manually enter data. Use get_input_status to identify which inputs are missing.`,
      },
      metadata: createToolMetadata({ source: "data_entry" }),
    };
  }
};

// ---- USER-WITHOUT-UTILITY CHECK ----

export const checkUserUtility = (
  user: CurrentUser,
): { valid: boolean; message: string | null } => {
  if (!user.org_id) {
    return {
      valid: false,
      message:
        "Your account is not associated with a specific utility. Contact your PRISM administrator to be assigned to an organisation. Until then, I can only answer general questions about the platform.",
    };
  }
  return { valid: true, message: null };
};

// ---- CITATION HELPER ----

export const createToolMetadataWithCitation = (
  source: string,
  period?: string | null,
  utility?: string | null,
): ReturnType<typeof createToolMetadata> => ({
  ...createToolMetadata({ source, freshness: new Date() }),
  data_freshness: new Date(),
  data_completeness_pct: period ? 100 : null,
  source: `${source}${period ? ` | Period: ${period}` : ""}${utility ? ` | Utility: ${utility}` : ""}`,
});
