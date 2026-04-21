type TrackingFrequency = "monthly" | "annually";

type PersistableKpi = {
  kpiDefinitionId: number;
  trackingFrequency: TrackingFrequency;
};

type PersistableInitiative = {
  description: string;
  kpis: PersistableKpi[];
};

type PersistableObjective = {
  description: string;
  keyInitiatives: PersistableInitiative[];
};

type PersistableByLevel = {
  perspectiveLevel: 1 | 2 | 3 | 4;
  objectives: PersistableObjective[];
};

type InitMessage = {
  type: "init";
  debounceMs: number;
  minChangeCount: number;
  lastSavedFingerprint?: string;
  apiOrigin?: string;
};

type SetSavedFingerprintMessage = {
  type: "setSavedFingerprint";
  fingerprint: string;
};

type ChangeMessage = {
  type: "change";
  fingerprint: string;
  reportPeriodId: number;
  persistableByLevel: PersistableByLevel[];
};

type StopMessage = {
  type: "stop";
};

type IncomingMessage =
  | InitMessage
  | SetSavedFingerprintMessage
  | ChangeMessage
  | StopMessage;

type StatusMessage = {
  type: "status";
  status: "idle" | "saving" | "saved" | "error";
  fingerprint?: string;
  message?: string;
};

const WORKER_LOG_PREFIX = "[bsc-autosave-worker]";
const logInfo = (...args: unknown[]) => {
  console.info(WORKER_LOG_PREFIX, ...args);
};
const logError = (...args: unknown[]) => {
  console.error(WORKER_LOG_PREFIX, ...args);
};

let debounceMs = 8000;
let minChangeCount = 1;
let lastSavedFingerprint = "";
let lastObservedFingerprint = "";
let pendingChangeCount = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingPayload: {
  fingerprint: string;
  reportPeriodId: number;
  persistableByLevel: PersistableByLevel[];
} | null = null;
let apiOrigin = "";

const perspectiveLabels: Record<1 | 2 | 3 | 4, string> = {
  1: "Financial",
  2: "Customer",
  3: "Operations",
  4: "Development",
};

const postStatus = (message: StatusMessage) => {
  self.postMessage(message);
};

const clearTimer = () => {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
};

const saveDraft = async (
  reportPeriodId: number,
  persistableByLevel: PersistableByLevel[],
): Promise<void> => {
  const draftUrl = new URL(
    "/api/data-entry/balanced-scorecard/draft",
    apiOrigin || self.location.origin,
  ).toString();

  logInfo("saveDraft:start", {
    reportPeriodId,
    draftUrl,
    levels: persistableByLevel.map((item) => ({
      perspectiveLevel: item.perspectiveLevel,
      objectiveCount: item.objectives.length,
    })),
  });

  for (const item of persistableByLevel) {
    if (item.objectives.length === 0) {
      continue;
    }

    logInfo("saveDraft:request", {
      perspectiveLevel: item.perspectiveLevel,
      objectiveCount: item.objectives.length,
    });

    const response = await fetch(draftUrl, {
      method: "PUT",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reportPeriodId,
        perspectiveLevel: item.perspectiveLevel,
        perspectiveDescription: perspectiveLabels[item.perspectiveLevel],
        objectives: item.objectives,
      }),
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      logError("saveDraft:response:error", {
        perspectiveLevel: item.perspectiveLevel,
        status: response.status,
        bodyMessage: result?.message,
      });
      throw new Error(
        result?.message ??
          `Unable to save template (status ${response.status}).`,
      );
    }

    logInfo("saveDraft:response:ok", {
      perspectiveLevel: item.perspectiveLevel,
      status: response.status,
    });
  }

  logInfo("saveDraft:complete");
};

const flushPendingSave = async () => {
  if (pendingPayload == null) {
    logInfo("flushPendingSave:skip:no-payload");
    return;
  }

  const payload = pendingPayload;
  logInfo("flushPendingSave:start", {
    fingerprint: payload.fingerprint,
    reportPeriodId: payload.reportPeriodId,
  });
  postStatus({ type: "status", status: "saving" });

  try {
    await saveDraft(payload.reportPeriodId, payload.persistableByLevel);
    lastSavedFingerprint = payload.fingerprint;
    lastObservedFingerprint = payload.fingerprint;
    pendingChangeCount = 0;
    postStatus({
      type: "status",
      status: "saved",
      fingerprint: payload.fingerprint,
    });
  } catch (error) {
    logError("flushPendingSave:error", error);
    postStatus({
      type: "status",
      status: "error",
      message: error instanceof Error ? error.message : "Autosave failed.",
    });
  }
};

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  if (message.type === "init") {
    logInfo("message:init", message);
    debounceMs = message.debounceMs;
    minChangeCount = message.minChangeCount;
    lastSavedFingerprint = message.lastSavedFingerprint ?? "";
    apiOrigin = message.apiOrigin ?? "";
    lastObservedFingerprint = lastSavedFingerprint;
    pendingChangeCount = 0;
    clearTimer();
    return;
  }

  if (message.type === "setSavedFingerprint") {
    logInfo("message:setSavedFingerprint", {
      fingerprint: message.fingerprint,
    });
    lastSavedFingerprint = message.fingerprint;
    lastObservedFingerprint = message.fingerprint;
    pendingChangeCount = 0;
    clearTimer();
    return;
  }

  if (message.type === "stop") {
    logInfo("message:stop");
    clearTimer();
    pendingPayload = null;
    pendingChangeCount = 0;
    return;
  }

  if (message.type !== "change") {
    return;
  }

  logInfo("message:change", {
    fingerprint: message.fingerprint,
    reportPeriodId: message.reportPeriodId,
    levels: message.persistableByLevel.map((item) => ({
      perspectiveLevel: item.perspectiveLevel,
      objectiveCount: item.objectives.length,
    })),
  });

  if (message.fingerprint === lastSavedFingerprint) {
    logInfo("message:change:already-saved", {
      fingerprint: message.fingerprint,
    });
    pendingChangeCount = 0;
    lastObservedFingerprint = message.fingerprint;
    clearTimer();
    postStatus({
      type: "status",
      status: "saved",
      fingerprint: message.fingerprint,
    });
    return;
  }

  if (message.fingerprint !== lastObservedFingerprint) {
    pendingChangeCount += 1;
    lastObservedFingerprint = message.fingerprint;
    logInfo("message:change:count-incremented", {
      pendingChangeCount,
      minChangeCount,
    });
  }

  pendingPayload = {
    fingerprint: message.fingerprint,
    reportPeriodId: message.reportPeriodId,
    persistableByLevel: message.persistableByLevel,
  };

  if (pendingChangeCount < minChangeCount) {
    logInfo("message:change:waiting-for-threshold", {
      pendingChangeCount,
      minChangeCount,
    });
    postStatus({ type: "status", status: "idle" });
    return;
  }

  postStatus({ type: "status", status: "idle" });
  clearTimer();
  logInfo("message:change:scheduling-save", { debounceMs });
  timer = setTimeout(() => {
    void flushPendingSave();
  }, debounceMs);
};
