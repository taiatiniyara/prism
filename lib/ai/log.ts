const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  subsystem: string;
  message: string;
  details?: Record<string, unknown>;
}

const formatEntry = (entry: LogEntry): string =>
  JSON.stringify(entry);

const shouldLog = (level: LogLevel): boolean =>
  LOG_LEVELS[level] >= (process.env.NODE_ENV === "production" ? LOG_LEVELS.warn : LOG_LEVELS.debug);

export const log = {
  debug: (subsystem: string, message: string, details?: Record<string, unknown>) => {
    if (!shouldLog("debug")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "debug", subsystem, message, details };
    console.debug(formatEntry(entry));
  },
  info: (subsystem: string, message: string, details?: Record<string, unknown>) => {
    if (!shouldLog("info")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "info", subsystem, message, details };
    console.info(formatEntry(entry));
  },
  warn: (subsystem: string, message: string, details?: Record<string, unknown>) => {
    if (!shouldLog("warn")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "warn", subsystem, message, details };
    console.warn(formatEntry(entry));
  },
  error: (subsystem: string, message: string, details?: Record<string, unknown>) => {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "error", subsystem, message, details };
    console.error(formatEntry(entry));
  },
};
