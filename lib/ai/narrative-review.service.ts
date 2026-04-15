import { canApproveNarrativeShare } from "./access-policy";

export type NarrativeDecision = "APPROVED" | "REJECTED";

interface NarrativeReviewRecord {
  traceId: string;
  decision: NarrativeDecision;
  rationale: string | null;
  reviewerUserId: string;
  reviewerRole: string;
  reviewedAt: string;
}

const reviewRecords: NarrativeReviewRecord[] = [];

export const recordNarrativeReviewDecision = (input: {
  traceId: string;
  decision: NarrativeDecision;
  rationale?: string | null;
  reviewerUserId: string;
  reviewerRole: string;
}): NarrativeReviewRecord => {
  if (!canApproveNarrativeShare(input.reviewerRole)) {
    throw new Error("FORBIDDEN:Only DEV/BMO can approve narrative sharing.");
  }

  const record: NarrativeReviewRecord = {
    traceId: input.traceId,
    decision: input.decision,
    rationale: input.rationale ?? null,
    reviewerUserId: input.reviewerUserId,
    reviewerRole: input.reviewerRole,
    reviewedAt: new Date().toISOString(),
  };

  reviewRecords.push(record);
  return record;
};

export const getLatestNarrativeReview = (
  traceId: string,
): NarrativeReviewRecord | null => {
  for (let i = reviewRecords.length - 1; i >= 0; i -= 1) {
    if (reviewRecords[i].traceId === traceId) {
      return reviewRecords[i];
    }
  }

  return null;
};
