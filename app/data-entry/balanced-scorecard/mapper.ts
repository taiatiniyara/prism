import type {
  ScorecardFilterContext,
  ScorecardResponse,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";

export const toScorecardResponse = (
  context: ScorecardFilterContext,
  snapshot: ScorecardSnapshot,
): ScorecardResponse => ({
  context,
  snapshot,
});
