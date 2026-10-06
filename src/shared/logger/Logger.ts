import type { LogLevel } from '../types/Settings';
import type { ActivityKind, ActivitySeverity } from '../types/Activity';
import { describeError } from '../utils/Common';

/** Anything that wants to persist log lines registers itself here. */
export type LogSink = (event: {
  kind: ActivityKind;
  severity: ActivitySeverity;
  message: string;
  detail?: Record<string, string | number | boolean>;
}) => void;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let activeLevel: LogLevel = 'info';
let sink: LogSink | null = null;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[activeLevel];
}

function emit(
  level: LogLevel,
  kind: ActivityKind,
  severity: ActivitySeverity,
  message: string,
  detail?: Record<string, string | number | boolean>,
): void {
  if (!shouldLog(level)) return;

  const consoleMethod = severity === 'error' ? console.error : severity === 'warning' ? console.warn : console.log;
  consoleMethod(`[DRA] ${message}`, detail ?? '');

  if (sink) {
    try {
      sink({ kind, severity, message, detail });
    } catch {
      // A failing sink must never break the caller's control flow.
    }
  }
}

/**
 * Structured logger. The service worker owns the only sink (the activity log),
 * which keeps storage writes out of the content script entirely.
 */
export const Logger = {
  setLevel(level: LogLevel): void {
    activeLevel = level;
  },

  setSink(next: LogSink | null): void {
    sink = next;
  },

  info(kind: ActivityKind, message: string, detail?: Record<string, string | number | boolean>): void {
    emit('info', kind, 'info', message, detail);
  },

  success(kind: ActivityKind, message: string, detail?: Record<string, string | number | boolean>): void {
    emit('info', kind, 'success', message, detail);
  },

  warn(kind: ActivityKind, message: string, detail?: Record<string, string | number | boolean>): void {
    emit('warn', kind, 'warning', message, detail);
  },

  error(kind: ActivityKind, message: string, error?: unknown): void {
    emit('error', kind, 'error', message, error === undefined ? undefined : { reason: describeError(error) });
  },

  debug(kind: ActivityKind, message: string, detail?: Record<string, string | number | boolean>): void {
    emit('debug', kind, 'info', message, detail);
  },
};
