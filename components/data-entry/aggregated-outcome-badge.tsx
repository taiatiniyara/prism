import { Badge } from "@/components/ui/badge";

interface AggregatedOutcomeBadgeProps {
  status: "calculated" | "skipped";
  reason?: string;
}

export function AggregatedOutcomeBadge({
  status,
  reason,
}: AggregatedOutcomeBadgeProps) {
  if (status === "calculated") {
    return <Badge variant="secondary">Calculated</Badge>;
  }

  return (
    <Badge
      variant="outline"
      className="text-amber-700 border-amber-300"
    >
      Skipped{reason ? `: ${reason}` : ""}
    </Badge>
  );
}
