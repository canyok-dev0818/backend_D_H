export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createConsoleLogger(): Logger {
  const log = (level: string, message: string, meta?: Record<string, unknown>) => {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    info: (m, meta) => log('info', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    error: (m, meta) => log('error', m, meta),
  };
}

/**
 * Production hooks: increment counters e.g.
 * - preferences_updates_total{status}
 * - notification_evaluate_total{decision, reason}
 * - notification_evaluate_duration_seconds histogram
 */
