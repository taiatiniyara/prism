import { describe, expect, it } from "vitest";

import { InMemoryTraceLogService } from "@/lib/ai/trace-log.service";

describe("trace retention", () => {
  it("prunes expired traces", async () => {
    const service = new InMemoryTraceLogService();

    const trace = await service.createTrace({
      requestId: "req-1",
      selectedTools: ["completeness-summary"],
      latencyMs: 10,
      status: "SUCCESS",
      rowCountReturned: 1,
    });

    await service.forceRetainedUntil(
      trace.traceId,
      new Date("2000-01-01T00:00:00.000Z"),
    );

    const removed = await service.pruneExpiredTraces(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const left = await service.listTraces();

    expect(removed).toBe(1);
    expect(left).toHaveLength(0);
  });
});
