import { GetReviewFeedback, ReviewFeedbackRow } from "./service";
import { Heading } from "@/components/heading";
import StateMessage from "@/components/ui/state-message";
import { MessageSquare } from "lucide-react";

function FeedbackCard({ item }: { item: ReviewFeedbackRow }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-sm">{item.inputName}</h4>
          <div className="text-xs text-muted-foreground">
            {item.utilityName} &middot; {item.reportPeriodLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono">{item.value ?? "—"}</div>
          {item.unitName && (
            <div className="text-xs text-muted-foreground">{item.unitName}</div>
          )}
        </div>
      </div>

      <div className="border-t pt-2 space-y-2">
        {item.comments.map((comment, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{comment.commenterRole}</span>
                <span className="text-muted-foreground">
                  {new Date(comment.date).toLocaleDateString()}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5">{comment.comment}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ReviewFeedbackPage() {
  const list = await GetReviewFeedback();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Heading level={5} className="font-bold">
          Review Feedback
        </Heading>
        <span className="text-sm text-muted-foreground">
          {list.length} data point{list.length !== 1 ? "s" : ""} with feedback
        </span>
      </div>

      {list.length === 0 ? (
        <StateMessage>No feedback items to review.</StateMessage>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((item) => (
            <FeedbackCard key={item.dataEntryId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
