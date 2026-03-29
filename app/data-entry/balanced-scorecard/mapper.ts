import type {
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardResponse,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";

export const toScorecardResponse = (
  context: ScorecardFilterContext,
  snapshot: ScorecardSnapshot,
  rows: ScorecardInputRow[],
): ScorecardResponse => ({
  context,
  snapshot,
  rows,
});
