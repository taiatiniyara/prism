import { Badge } from "@/components/ui/badge";

export type CustomKpiRequestStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REPLACED";

const classes: Record<CustomKpiRequestStatus, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  REPLACED: "bg-sky-100 text-sky-800",
};

const labels: Record<CustomKpiRequestStatus, string> = {
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REPLACED: "Replaced",
};

export const getCustomKpiStatusPresentation = (
  status: CustomKpiRequestStatus,
) => ({
  className: classes[status],
  label: labels[status],
});

export function CustomKpiRequestStatusBadge({
  status,
}: {
  status: CustomKpiRequestStatus;
}) {
  const presentation = getCustomKpiStatusPresentation(status);
  return <Badge className={presentation.className}>{presentation.label}</Badge>;
}
