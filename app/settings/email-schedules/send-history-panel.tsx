"use client";

import { useState } from "react";
import { GetSendLogs } from "./service";
import { EmailSchedule } from "@/db/schema/email-schedules";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";

interface SendLog {
  id: number;
  schedule_id: number;
  recipient_count: number;
  error_count: number;
  sent_by: string | null;
  sent_at: Date;
}

export default function SendHistoryPanel({
  schedules,
}: {
  schedules: EmailSchedule[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logs, setLogs] = useState<Record<number, SendLog[]>>({});
  const [loading, setLoading] = useState<number | null>(null);

  const fetchLogs = async (scheduleId: number) => {
    if (logs[scheduleId]?.length) return;
    setLoading(scheduleId);
    try {
      const data = await GetSendLogs(scheduleId);
      setLogs((prev) => ({ ...prev, [scheduleId]: data }));
    } catch {
      // silent
    } finally {
      setLoading(null);
    }
  };

  const toggle = (scheduleId: number) => {
    if (expanded === scheduleId) {
      setExpanded(null);
    } else {
      setExpanded(scheduleId);
      fetchLogs(scheduleId);
    }
  };

  return (
    <div className="px-5 pb-5">
      <h3 className="text-sm font-semibold mb-3">Send History</h3>
      <div className="space-y-1">
        {schedules.map((s) => (
          <div key={s.id} className="rounded-lg border">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 rounded-lg"
              onClick={() => toggle(s.id)}
            >
              {expanded === s.id ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground">
                ({s.recipient_role})
              </span>
            </button>
            {expanded === s.id && (
              <div className="border-t px-3 py-2">
                {loading === s.id ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Loading...
                  </p>
                ) : (logs[s.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No sends recorded yet.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {(logs[s.id] ?? []).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between text-xs py-1"
                      >
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(log.sent_at).toLocaleString()}
                        </span>
                        <span>
                          {log.recipient_count} sent
                          {log.error_count > 0 && (
                            <span className="text-danger ml-1">
                              ({log.error_count} errors)
                            </span>
                          )}
                        </span>
                        {log.sent_by && (
                          <span className="text-muted-foreground">
                            by {log.sent_by}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
