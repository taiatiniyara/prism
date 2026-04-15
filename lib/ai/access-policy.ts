import type { AiUserRole } from "./types";
import type { AllowedReadServiceDefinition } from "./allowed-read-services";

const launchRoles = new Set<AiUserRole>(["DEV", "BMO", "BLO", "CEO"]);
const narrativeApproverRoles = new Set<AiUserRole>(["DEV", "BMO"]);

export const canUseAiAssistant = (role: string): role is AiUserRole => {
  return launchRoles.has(role as AiUserRole);
};

export const canExecuteService = (
  role: AiUserRole,
  service: AllowedReadServiceDefinition,
): boolean => {
  return service.allowedRoles.includes(role);
};

export const canApproveNarrativeShare = (role: string): boolean => {
  return narrativeApproverRoles.has(role as AiUserRole);
};
