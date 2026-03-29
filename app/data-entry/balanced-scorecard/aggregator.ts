import type {
  ExcludedScoreRow,
  PerspectiveScore,
  ScorecardInputRow,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";

const APPROVED_STATUS_ID = 5;

const toReason = (
  kpiId: string,
  reasonCode: ExcludedScoreRow["reasonCode"],
  reasonMessage: string,
): ExcludedScoreRow => ({
  kpiId,
  reasonCode,
  reasonMessage,
});

const aggregateStatus = (rows: ScorecardInputRow[]) => {
  let onTrack = 0;
  let atRisk = 0;
  let offTrack = 0;

  for (const row of rows) {
    if (row.status === "on_track") {
      onTrack += 1;
      continue;
    }
    if (row.status === "at_risk") {
      atRisk += 1;
      continue;
    }
    offTrack += 1;
  }

  return { onTrack, atRisk, offTrack };
};

const dedupeLatestApproved = (
  rows: ScorecardInputRow[],
): { included: ScorecardInputRow[]; excluded: ExcludedScoreRow[] } => {
  const groups = new Map<string, ScorecardInputRow[]>();
  const excluded: ExcludedScoreRow[] = [];

  for (const row of rows) {
    const key = `${row.kpiDefinitionId}:${row.filterScopeKey}`;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }

  const included: ScorecardInputRow[] = [];

  for (const groupRows of groups.values()) {
    const approved = groupRows
      .filter((row) => row.approvalStateId === APPROVED_STATUS_ID)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (approved.length === 0) {
      for (const row of groupRows) {
        excluded.push(
          toReason(row.kpiId, "NOT_APPROVED", "Row is not in approved state."),
        );
      }
      continue;
    }

    const selected = approved[0];
    included.push(selected);

    for (const row of groupRows) {
      if (row.kpiId === selected.kpiId) {
        continue;
      }
      excluded.push(
        toReason(
          row.kpiId,
          "DUPLICATE_SUPERSEDED",
          "Superseded by latest approved row for this KPI scope.",
        ),
      );
    }
  }

  return { included, excluded };
};

const validateRows = (
  rows: ScorecardInputRow[],
): { validRows: ScorecardInputRow[]; excluded: ExcludedScoreRow[] } => {
  const validRows: ScorecardInputRow[] = [];
  const excluded: ExcludedScoreRow[] = [];

  for (const row of rows) {
    if (row.actualValue == null) {
      excluded.push(
        toReason(row.kpiId, "MISSING_ACTUAL", "Missing actual value."),
      );
      continue;
    }

    if (row.targetValue == null) {
      excluded.push(
        toReason(row.kpiId, "MISSING_TARGET", "Missing target value."),
      );
      continue;
    }

    if (row.targetValue < 0 || row.actualValue < 0) {
      excluded.push(
        toReason(
          row.kpiId,
          "INVALID_RANGE",
          "Negative values are not valid for score calculation.",
        ),
      );
      continue;
    }

    validRows.push(row);
  }

  return { validRows, excluded };
};

const scoreOf = (row: ScorecardInputRow): number => {
  if (
    row.targetValue == null ||
    row.targetValue === 0 ||
    row.actualValue == null
  ) {
    return 0;
  }

  return Math.max(0, Math.min(100, (row.actualValue / row.targetValue) * 100));
};

export const buildScorecardSnapshot = (
  rows: ScorecardInputRow[],
): ScorecardSnapshot => {
  const deduped = dedupeLatestApproved(rows);
  const validated = validateRows(deduped.included);
  const allExcluded = [...deduped.excluded, ...validated.excluded];

  const byPerspective = new Map<number, ScorecardInputRow[]>();
  for (const row of validated.validRows) {
    const list = byPerspective.get(row.perspectiveLevel) ?? [];
    list.push(row);
    byPerspective.set(row.perspectiveLevel, list);
  }

  const perspectiveScores: PerspectiveScore[] = Array.from(
    byPerspective.entries(),
  )
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => {
      const totalWeight = list.reduce((sum, row) => sum + row.kpiWeight, 0);
      const weightedSum = list.reduce(
        (sum, row) => sum + scoreOf(row) * row.kpiWeight,
        0,
      );
      const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : null;
      const label = list[0]?.perspectiveLabel ?? "Unassigned";
      const exclusions = allExcluded.filter(
        (item) => list.some((row) => row.kpiId === item.kpiId) === false,
      );

      return {
        perspectiveLevel: level,
        perspectiveLabel: label,
        weightedScore,
        includedCount: list.length,
        excludedCount: exclusions.length,
        statusBreakdown: aggregateStatus(list),
        exclusions,
      };
    });

  const totalPerspectiveWeight = perspectiveScores.reduce(
    (sum, score) => sum + (score.weightedScore == null ? 0 : 1),
    0,
  );
  const overallWeighted = perspectiveScores.reduce(
    (sum, score) => sum + (score.weightedScore ?? 0),
    0,
  );
  const overallScore =
    totalPerspectiveWeight > 0
      ? overallWeighted / totalPerspectiveWeight
      : null;

  const byReason: Record<string, number> = {};
  for (const row of allExcluded) {
    byReason[row.reasonCode] = (byReason[row.reasonCode] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    overallScore,
    perspectiveScores,
    excludedSummary: {
      totalExcluded: allExcluded.length,
      byReason,
    },
  };
};
