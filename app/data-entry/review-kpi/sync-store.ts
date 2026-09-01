import { SyncEventEnvelope } from "@/app/data-entry/review-kpi/types";

type SyncListener = (event: SyncEventEnvelope) => void;

const MAX_EVENTS = 500;

interface SyncStore {
  events: SyncEventEnvelope[];
  listeners: Set<SyncListener>;
}

const getStore = (): SyncStore => {
  const g = globalThis as { __reviewKpiSyncStore?: SyncStore };

  if (!g.__reviewKpiSyncStore) {
    g.__reviewKpiSyncStore = {
      events: [],
      listeners: new Set<SyncListener>(),
    };
  }

  return g.__reviewKpiSyncStore;
};

export const publishSyncEvent = (event: SyncEventEnvelope) => {
  const store = getStore();
  store.events.push(event);

  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }

  for (const listener of store.listeners) {
    listener(event);
  }
};

export const subscribeToSyncEvents = (listener: SyncListener) => {
  const store = getStore();
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
  };
};

export const listSyncEventsSince = (sinceEventId: string | null) => {
  const store = getStore();

  if (!sinceEventId) {
    return store.events;
  }

  const index = store.events.findIndex((event) => event.eventId === sinceEventId);
  if (index < 0) {
    return store.events;
  }

  return store.events.slice(index + 1);
};
