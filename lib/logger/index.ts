/**
 * Centralized logger. Use this instead of console.* throughout the app so
 * logging stays consistent and secrets never leak into logs.
 *
 * Not a full observability platform by design — this is the foundation
 * (structured console output). Swap the `write` implementation for a real
 * sink (e.g. a hosted log service) later without touching call sites.
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|api[-_]?key|service[-_]?role|session|authorization|cookie)/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val),
      ]),
    );
  }

  return value;
}

function write(level: LogLevel, message: string, context?: LogContext) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;

  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? { context: redact(context) } : {}),
  };

  const method = level === "debug" ? "log" : level;
  console[method](JSON.stringify(payload));
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
