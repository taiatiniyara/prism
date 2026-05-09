// Lightweight structured telemetry for chatbot capability routing.
// Emits one JSON line per resolution so logs can be aggregated by capability,
// fallback rate, and per-builder latency without pulling in a metrics SDK.
//
// Set CHATBOT_TELEMETRY=off to silence (e.g. for tests).

export interface CapabilityTelemetryEvent {
  matched: string[];
  used: string[];
  fallbackUsed: boolean;
  totalMs: number;
  perCapabilityMs: Record<string, number>;
  recommendedView: string;
  messageLength: number;
}

export const emitCapabilityTelemetry = (
  event: CapabilityTelemetryEvent,
): void => {
  if ((process.env.CHATBOT_TELEMETRY ?? "on").toLowerCase() === "off") {
    return;
  }

  console.log(
    JSON.stringify({
      kind: "chatbot.capability",
      ts: new Date().toISOString(),
      ...event,
    }),
  );
};
