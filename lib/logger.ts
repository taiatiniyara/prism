type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

interface LogEntry {
  level: LogLevel;
  message: string;
  meta?: LogMeta;
  timestamp: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === "debug") return "debug";
  if (env === "info") return "info";
  if (env === "warn") return "warn";
  if (env === "error") return "error";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()];
}

function formatEntry(entry: LogEntry): void {
  const { level, message, meta, timestamp } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (meta && Object.keys(meta).length > 0) {
    if (level === "error") {
      console.error(`${prefix} ${message}`, meta);
    } else if (level === "warn") {
      console.warn(`${prefix} ${message}`, meta);
    } else {
      console.log(`${prefix} ${message}`, meta);
    }
  } else {
    if (level === "error") {
      console.error(`${prefix} ${message}`);
    } else if (level === "warn") {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

function log(level: LogLevel, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };

  formatEntry(entry);
}

export const logger = {
  debug(message: string, meta?: LogMeta) {
    log("debug", message, meta);
  },
  info(message: string, meta?: LogMeta) {
    log("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    log("warn", message, meta);
  },
  error(message: string, meta?: LogMeta) {
    log("error", message, meta);
  },
};
