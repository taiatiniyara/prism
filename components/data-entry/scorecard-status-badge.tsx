import { Badge } from "@/components/ui/badge";

type StatusKind = "on_track" | "at_risk" | "off_track";

const classes: Record<StatusKind, string> = {
  on_track: "bg-lime-100 text-lime-800",
  at_risk: "bg-amber-100 text-amber-800",
  off_track: "bg-rose-100 text-rose-800",
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
