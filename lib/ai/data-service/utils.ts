import { db } from "@/db/connection";
import { aiReviewQueue } from "@/db/schema/ai";
import { desc } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

// ---- CIRCUIT BREAKER ----

const toolFailures = new Map<string, { count: number; lastFail: number; cooldownUntil: number }>();
const MAX_FAILURES = 5;
const COOLDOWN_MS = 60000;

export const recordToolFailure = (toolName: string): boolean => {
  const now = Date.now();
  const entry = toolFailures.get(toolName) ?? { count: 0, lastFail: 0, cooldownUntil: 0 };

  if (now < entry.cooldownUntil) return false;

  entry.count++;
  entry.lastFail = now;

  if (entry.count >= MAX_FAILURES) {
    entry.cooldownUntil = now + COOLDOWN_MS;
    entry.count = 0;
    return false;
  }

  toolFailures.set(toolName, entry);
  return true;
};

export const resetToolCircuit = (toolName: string): void => {
  toolFailures.delete(toolName);
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
    metadata: createToolMetadata({ freshness: new Date(), source: "ai_review_queue" }),
  };
};

// ---- GUIDED DATA ENTRY ----

export interface GuidedEntryStep {
  step: number;
  input_name: string;
  input_def_id: number | null;
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
  return {
    data: {
      kpi_name: options.kpi_name || "Unknown",
      steps: [],
      total_steps: 0,
      completed_steps: 0,
      message: `To enter data for "${options.kpi_name}", navigate to /data-entry/enter-data in PRISM. First use get_input_status to identify which inputs are missing, then find those inputs in the data entry module. You can also use the dashboard_link tool to generate a direct link to the correct page.`,
    },
    metadata: createToolMetadata({ source: "data_entry" }),
  };
};

// ---- USER-WITHOUT-UTILITY CHECK ----

export const checkUserUtility = (
  user: CurrentUser,
): { valid: boolean; message: string | null } => {
  if (!user.org_id) {
    return {
      valid: false,
      message: "Your account is not associated with a specific utility. Contact your PRISM administrator to be assigned to an organisation. Until then, I can only answer general questions about the platform.",
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
