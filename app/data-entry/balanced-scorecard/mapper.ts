import type {
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardRelationship,
  ScorecardResponse,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";

export const toScorecardResponse = (
  context: ScorecardFilterContext,
  snapshot: ScorecardSnapshot,
  rows: ScorecardInputRow[],
  relationships: ScorecardRelationship[],
): ScorecardResponse => ({
  context,
  snapshot,
  rows,
  relationships,
});
