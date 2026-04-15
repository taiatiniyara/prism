"use client";

import { useEffect, useRef, useState } from "react";

import {
  ReviewKpiFilterContext,
  SyncEventEnvelope,
} from "@/app/data-entry/review-kpi/types";

interface UseReviewKpiSyncOptions {
  context: ReviewKpiFilterContext;
  onEvent: (event: SyncEventEnvelope) => void;
}

interface SyncStatus {
  isConnected: boolean;
  error: string | null;
}

interface SyncChannel {
  context: ReviewKpiFilterContext;
  source: EventSource | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  listeners: Set<(event: SyncEventEnvelope) => void>;
  statusListeners: Set<(status: SyncStatus) => void>;
  isConnected: boolean;
  error: string | null;
  lastEventId: string | null;
  stopped: boolean;
}

const getChannels = (): Map<string, SyncChannel> => {
  const globalKey = "__reviewKpiSyncChannels";
  const globalState = globalThis as unknown as Record<
    string,
    Map<string, SyncChannel> | undefined
  >;

  if (!globalState[globalKey]) {
    globalState[globalKey] = new Map<string, SyncChannel>();
  }

  return globalState[globalKey]!;
};

const toUrl = (
  context: ReviewKpiFilterContext,
  sinceEventId?: string | null,
): string => {
  const params = new URLSearchParams();
  if (context.reportPeriodId != null) {
    params.set("reportPeriodId", String(context.reportPeriodId));
  }
  if (context.serviceAreaId != null) {
    params.set("serviceAreaId", String(context.serviceAreaId));
  }
  if (context.kpiCategoryId != null) {
    params.set("kpiCategoryId", String(context.kpiCategoryId));
  }
  if (context.kpiSubcategoryId != null) {
    params.set("kpiSubcategoryId", String(context.kpiSubcategoryId));
  }
  if (sinceEventId) {
    params.set("sinceEventId", sinceEventId);
  }

  return `/api/data-entry/review-kpi/events?${params.toString()}`;
};

const buildChannelKey = (context: ReviewKpiFilterContext) => toUrl(context);

const emitStatus = (channel: SyncChannel) => {
  const snapshot: SyncStatus = {
    isConnected: channel.isConnected,
    error: channel.error,
  };

  for (const listener of channel.statusListeners) {
    listener(snapshot);
  }
};

const emitEvent = (channel: SyncChannel, event: SyncEventEnvelope) => {
  channel.lastEventId = event.eventId;

  for (const listener of channel.listeners) {
    listener(event);
  }
};

const recoverMissedEvents = async (channel: SyncChannel) => {
  const response = await fetch(toUrl(channel.context, channel.lastEventId));
  if (!response.ok) {
    throw new Error("Catch-up failed");
  }

  const body = (await response.json()) as { events?: SyncEventEnvelope[] };
  for (const event of body.events ?? []) {
    emitEvent(channel, event);
  }
};

const connectChannel = (channel: SyncChannel) => {
  if (channel.stopped) {
    return;
  }

  channel.source = new EventSource(toUrl(channel.context));

  channel.source.onopen = () => {
    channel.isConnected = true;
    channel.error = null;
    emitStatus(channel);
  };

  channel.source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as SyncEventEnvelope;
      emitEvent(channel, event);
    } catch {
      channel.error = "Received malformed sync event.";
      emitStatus(channel);
    }
  };

  channel.source.onerror = async () => {
    channel.isConnected = false;
    emitStatus(channel);
    channel.source?.close();
    channel.source = null;

    try {
      await recoverMissedEvents(channel);
      channel.error = null;
    } catch {
      channel.error = "Realtime sync recovery failed.";
    }

    emitStatus(channel);

    if (channel.stopped) {
      return;
    }

    channel.reconnectTimer = setTimeout(() => {
      connectChannel(channel);
    }, 1500);
  };
};

const ensureChannel = (context: ReviewKpiFilterContext): SyncChannel => {
  const channels = getChannels();
  const key = buildChannelKey(context);
  const existing = channels.get(key);

  if (existing) {
    return existing;
  }

  const channel: SyncChannel = {
    context,
    source: null,
    reconnectTimer: null,
    listeners: new Set(),
    statusListeners: new Set(),
    isConnected: false,
    error: null,
    lastEventId: null,
    stopped: false,
  };

  channels.set(key, channel);
  connectChannel(channel);

  return channel;
};

const releaseChannelIfUnused = (context: ReviewKpiFilterContext) => {
  const channels = getChannels();
  const key = buildChannelKey(context);
  const channel = channels.get(key);

  if (!channel) {
    return;
  }

  if (channel.listeners.size > 0 || channel.statusListeners.size > 0) {
    return;
  }

  channel.stopped = true;
  if (channel.reconnectTimer) {
    clearTimeout(channel.reconnectTimer);
  }
  channel.source?.close();
  channels.delete(key);
};

export const useReviewKpiSync = ({
  context,
  onEvent,
}: UseReviewKpiSyncOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (context.reportPeriodId == null) {
      return;
    }

    const channel = ensureChannel(context);

    const eventListener = (event: SyncEventEnvelope) => {
      onEventRef.current(event);
    };
    const statusListener = (status: SyncStatus) => {
      setIsConnected(status.isConnected);
      setError(status.error);
    };

    channel.listeners.add(eventListener);
    channel.statusListeners.add(statusListener);
    statusListener({ isConnected: channel.isConnected, error: channel.error });

    return () => {
      channel.listeners.delete(eventListener);
      channel.statusListeners.delete(statusListener);
      releaseChannelIfUnused(context);
    };
  }, [context]);

  return {
    isConnected: context.reportPeriodId == null ? false : isConnected,
    error: context.reportPeriodId == null ? null : error,
  };
};
