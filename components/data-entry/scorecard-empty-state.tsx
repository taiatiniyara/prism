import StateMessage from "@/components/ui/state-message";

export default function ScorecardEmptyState() {
  return (
    <StateMessage className="text-xs">
      No scorecard rows are available for the selected filters.
    </StateMessage>
  );
}
