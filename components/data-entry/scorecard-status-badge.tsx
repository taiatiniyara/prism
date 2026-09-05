import { Badge } from "@/components/ui/badge";

type StatusKind = "on_track" | "at_risk" | "off_track";

const classes: Record<StatusKind, string> = {
  on_track: "bg-success/10 text-success",
  at_risk: "bg-warning/10 text-warning",
  off_track: "bg-danger/10 text-danger",
};

const labels: Record<StatusKind, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

export default function ScorecardStatusBadge({
  status,
}: {
  status: StatusKind;
}) {
  return <Badge className={classes[status]}>{labels[status]}</Badge>;
}
