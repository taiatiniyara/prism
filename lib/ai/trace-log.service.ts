import type { AiTraceRecord, AiTraceStatus, AiUserRole } from "./types";

export interface CreateTraceInput {
  requestId: string;
  selectedTools: string[];
  latencyMs: number;
  status: AiTraceStatus;
  failureType?: string | null;
  rowCountReturned: number;
}

export interface ListTraceFilters {
  status?: AiTraceStatus;
  limit?: number;
}

export interface TraceLogService {
  createTrace(input: CreateTraceInput): Promise<AiTraceRecord>;
  listTraces(filters?: ListTraceFilters): Promise<AiTraceRecord[]>;
  canReviewTraces(role: AiUserRole): boolean;
  pruneExpiredTraces(now: Date): Promise<number>;
}

const ADMIN_REVIEW_ROLES = new Set<AiUserRole>(["DEV", "BMO"]);

export class InMemoryTraceLogService implements TraceLogService {
  private readonly traces: AiTraceRecord[] = [];

  async createTrace(input: CreateTraceInput): Promise<AiTraceRecord> {
    const now = new Date();
    const retainedUntil = new Date(now);
    retainedUntil.setDate(retainedUntil.getDate() + 90);

    const trace: AiTraceRecord = {
      traceId: crypto.randomUUID(),
      requestId: input.requestId,
      selectedTools: input.selectedTools,
      latencyMs: input.latencyMs,
      status: input.status,
      failureType: input.failureType ?? null,
      rowCountReturned: input.rowCountReturned,
      retainedUntil: retainedUntil.toISOString(),
      createdAt: now.toISOString(),
    };

    this.traces.unshift(trace);
    return trace;
  }

  async listTraces(filters?: ListTraceFilters): Promise<AiTraceRecord[]> {
    const status = filters?.status;
    const limit = filters?.limit ?? 50;

    const filtered = status
      ? this.traces.filter((trace) => trace.status === status)
      : this.traces;

    return filtered.slice(0, limit);
  }

  canReviewTraces(role: AiUserRole): boolean {
    return ADMIN_REVIEW_ROLES.has(role);
  }

  async pruneExpiredTraces(now: Date): Promise<number> {
    const before = this.traces.length;
    const nowValue = now.getTime();

    for (let i = this.traces.length - 1; i >= 0; i -= 1) {
      const retainedUntil = new Date(this.traces[i].retainedUntil).getTime();
      if (retainedUntil <= nowValue) {
        this.traces.splice(i, 1);
      }
    }

    return before - this.traces.length;
  }

  async forceRetainedUntil(
    traceId: string,
    retainedUntil: Date,
  ): Promise<void> {
    const trace = this.traces.find((item) => item.traceId === traceId);
    if (!trace) {
      return;
    }

    trace.retainedUntil = retainedUntil.toISOString();
  }
}

export const traceLogService = new InMemoryTraceLogService();
