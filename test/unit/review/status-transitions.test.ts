import { describe, expect, it } from "vitest";

import { getAvailableStatusActions } from "@/app/data-entry/review-kpi/status-transitions";
import { DataEntryStatusId } from "@/db/schema/dataEntryStatus";

describe("getAvailableStatusActions", () => {
  it("offers Mark Reviewed on an Entered input only to a reviewer", () => {
    const reviewer = getAvailableStatusActions(DataEntryStatusId.Entered, {
      canReview: true,
      canApprove: false,
    });
    expect(reviewer.map((a) => a.label)).toEqual(["Mark Reviewed"]);

    const approverOnly = getAvailableStatusActions(DataEntryStatusId.Entered, {
      canReview: false,
      canApprove: true,
    });
    expect(approverOnly).toEqual([]);
  });

  it("offers Approve and Send back on a Reviewed input to an approver", () => {
    const actions = getAvailableStatusActions(DataEntryStatusId.Reviewed, {
      canReview: false,
      canApprove: true,
    });
    expect(actions.map((a) => a.label)).toEqual(["Approve", "Send back"]);
  });

  it("offers only Send back on a Reviewed input to a reviewer who can't approve", () => {
    const actions = getAvailableStatusActions(DataEntryStatusId.Reviewed, {
      canReview: true,
      canApprove: false,
    });
    expect(actions.map((a) => a.label)).toEqual(["Send back"]);
  });

  it("offers only Send back on an Approved input, and only to an approver", () => {
    const approver = getAvailableStatusActions(DataEntryStatusId.Approved, {
      canReview: true,
      canApprove: true,
    });
    expect(approver.map((a) => a.label)).toEqual(["Send back"]);
    expect(approver[0].toStatusId).toBe(DataEntryStatusId.Reviewed);

    const reviewerOnly = getAvailableStatusActions(DataEntryStatusId.Approved, {
      canReview: true,
      canApprove: false,
    });
    expect(reviewerOnly).toEqual([]);
  });

  it("offers nothing on a Pending input", () => {
    expect(
      getAvailableStatusActions(DataEntryStatusId.Pending, {
        canReview: true,
        canApprove: true,
      }),
    ).toEqual([]);
  });
});
