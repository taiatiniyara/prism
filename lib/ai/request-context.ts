import type { CurrentUser } from "@/lib/user.service";

// The per-request system-prompt suffix: everything about THIS caller and THIS
// conversation that the model needs and that must not live in the cached base prompt
// (see lib/ai/service.ts `systemPromptSuffix`). One builder, used by the chat route
// AND by the eval harness (scripts/ai-eval.ts) — the harness used to hand-copy this
// text and silently fell behind when the route gained the own-utility line.

const ADMIN_ROLES = new Set(["BMO", "DEV"]);

export const isAdminRole = (role: string | null | undefined): boolean =>
  role != null && ADMIN_ROLES.has(role.toUpperCase());

export const getAudienceRegister = (role: string | null | undefined): string => {
  const upper = (role ?? "").toUpperCase();

  switch (upper) {
    case "CEO":
    case "EXE":
      return "CEO / Executive / Board";
    case "BMO":
    case "MGR":
      return "Manager / Operations";
    case "DEV":
    case "BLO":
    case "DAOF":
    case "DAOH":
    case "DAOO":
      return "Staff / Analyst";
    case "EXT":
      return "Consultant";
    default:
      return "Manager / Operations";
  }
};

export interface RequestContextOptions {
  // Validated `ai_chat_session.context_summary` from earlier turns (route-side).
  contextSummary?: { topics?: string[]; key_findings?: string[] } | null;
  // From checkUserUtility(user): an invalid utility yields an IMPORTANT notice.
  utilityNotice?: string | null;
  // Number of user turns so far; past 8 the model is asked to recap before answering.
  conversationTurns?: number;
}

export const SUMMARISE_AFTER_TURNS = 8;

export const buildRequestContext = (
  user: Pick<CurrentUser, "role" | "org_id">,
  options: RequestContextOptions = {},
): string => {
  const roleContext = user.role
    ? `\n\nCurrent audience register: ${getAudienceRegister(user.role)}.${
        isAdminRole(user.role)
          ? " This user is a platform administrator (BMO/DEV) — they can access all utilities' approved Financial Year data, approve custom KPIs, and manage configuration. Cross-utility benchmarking across all utilities is fully available to them."
          : user.role === "EXT"
            ? " This user is an external stakeholder. Their data access may be limited — do not claim other utilities' data is missing when it simply may not be visible to this user."
            : " This user is a utility role (BLO/CEO/EXE/MGR/DAOF/DAOH/DAOO). They can benchmark their KPIs against every utility's approved Financial Year data and are fully entitled to cross-utility benchmarking results. BMO/DEV platform-admin powers (approving custom KPIs, managing configuration) remain admin-only."
      }`
    : "";

  // Tell the model the caller's OWN utility so it never asks "which utility are you
  // from?" (14× in prod) and resolves "my/our utility" correctly. Uses user.org_id →
  // belongs here, in the uncached suffix, never in the cached base prompt.
  const ownUtilityContext =
    !isAdminRole(user.role) && user.org_id != null
      ? `\n\nThis user belongs to utility_id ${user.org_id} — resolve it via the utility directory; "my/our utility" means that one. Don't ask which utility they belong to.`
      : "";

  let contextBlock = "";
  const summary = options.contextSummary;
  if (summary) {
    const parts: string[] = [];
    if (Array.isArray(summary.topics) && summary.topics.length) parts.push(`Previous topics: ${summary.topics.join(", ")}`);
    if (Array.isArray(summary.key_findings) && summary.key_findings.length) parts.push(`Previous findings: ${summary.key_findings.join(", ")}`);
    if (parts.length) contextBlock = `\n\nConversation context from earlier turns: ${parts.join(". ")}`;
  }

  const utilityBlock = options.utilityNotice ? `\n\nIMPORTANT: ${options.utilityNotice}` : "";

  const turns = options.conversationTurns ?? 0;
  const summariseBlock =
    turns > SUMMARISE_AFTER_TURNS
      ? `\n\nNOTE: This conversation has ${turns} turns. Before answering, briefly summarise the key context from earlier turns in 1-2 sentences, then answer the latest question concisely.`
      : "";

  return roleContext + ownUtilityContext + contextBlock + utilityBlock + summariseBlock;
};
