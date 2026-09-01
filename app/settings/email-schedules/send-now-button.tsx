"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { SendSummaryNow, SendTestToSelf } from "./service";

export default function SendNowButton({
  scheduleId,
  scheduleName,
}: {
  scheduleId: number;
  scheduleName: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSend = async (test: boolean) => {
    const key = test ? "test" : "send";
    setLoading(key);
    try {
      const result = test
        ? await SendTestToSelf(scheduleId)
        : await SendSummaryNow(scheduleId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to send");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="inline-flex items-center rounded-lg border">
      <Button
        size="sm"
        variant="ghost"
        className="rounded-r-none"
        onClick={() => handleSend(false)}
        disabled={loading !== null}
      >
        {loading === "send" ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="mr-1.5 h-3.5 w-3.5" />
        )}
        {scheduleName}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="rounded-l-none border-l px-2"
        onClick={() => handleSend(true)}
        disabled={loading !== null}
        title="Send test to yourself"
      >
        {loading === "test" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FlaskConical className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
