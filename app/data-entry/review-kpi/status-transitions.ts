import { DataEntryStatusId } from "@/db/schema/dataEntryStatus";
import { ReviewKpiPermissions } from "@/app/data-entry/review-kpi/types";

export interface ReviewKpiStatusAction {
  label: string;
  confirmLabel: string;
  toStatusId: number;
  tone: "advance" | "reject";
}

/**
 * Which status buttons a viewer may act on for a given input, given its current status. Mirrors
 * the server-side transition table in service.ts (STATUS_TRANSITIONS) — this is UI-hint only,
 * the API route re-checks the transition and role server-side before writing anything.
 */
export const getAvailableStatusActions = (
  statusId: number,
  permissions: ReviewKpiPermissions,
): ReviewKpiStatusAction[] => {
  const actions: ReviewKpiStatusAction[] = [];

  if (statusId === DataEntryStatusId.Entered && permissions.canReview) {
    actions.push({
      label: "Mark Reviewed",
      confirmLabel: "Mark this input as Reviewed?",
      toStatusId: DataEntryStatusId.Reviewed,
      tone: "advance",
    });
  }

  if (statusId === DataEntryStatusId.Reviewed) {
    if (permissions.canApprove) {
      actions.push({
        label: "Approve",
        confirmLabel: "Approve this input? This publishes it.",
        toStatusId: DataEntryStatusId.Approved,
        tone: "advance",
      });
    }

    if (permissions.canReview || permissions.canApprove) {
      actions.push({
        label: "Send back",
        confirmLabel: "Send this input back to Entered?",
        toStatusId: DataEntryStatusId.Entered,
        tone: "reject",
      });
    }
  }

  if (statusId === DataEntryStatusId.Approved && permissions.canApprove) {
    actions.push({
      label: "Send back",
      confirmLabel:
        "Send this input back to Reviewed? It will no longer be published.",
      toStatusId: DataEntryStatusId.Reviewed,
      tone: "reject",
    });
  }

  return actions;
};
