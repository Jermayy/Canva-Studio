/**
 * Minimal structured logger (structured JSON, secrets redacted).
 *
 * Emits one JSON object per line so logs are machine-readable. Context keys
 * that look like secrets are redacted before writing.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (context: LogContext) => Logger;
}

type Sink = (level: LogLevel, line: string) => void;

const SENSITIVE_KEY = /token|password|secret|authorization|cookie|key$/i;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function redact(context: LogContext): LogContext {
  const result: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = '[REDACTED]';
    } else if (value instanceof Error) {
      result[key] = { name: value.name, message: value.message };
    } else {
      result[key] = value;
    }
  }
  return result;
}

const consoleSink: Sink = (level, line) => {
  switch (level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
};

export interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
  sink?: Sink;
  now?: () => Date;
  baseContext?: LogContext;
}

export function createLogger(options: LoggerOptions): Logger {
  const minLevel = options.minLevel ?? 'info';
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());
  const baseContext = options.baseContext ?? {};

  const write = (
    level: LogLevel,
    message: string,
    context: LogContext = {},
  ): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
      return;
    }
    const entry = {
      timestamp: now().toISOString(),
      level,
      service: options.service,
      message,
      ...redact({ ...baseContext, ...context }),
    };
    sink(level, JSON.stringify(entry));
  };

  return {
    debug: (message, context) => {
      write('debug', message, context);
    },
    info: (message, context) => {
      write('info', message, context);
    },
    warn: (message, context) => {
      write('warn', message, context);
    },
    error: (message, context) => {
      write('error', message, context);
    },
    child: (context) =>
      createLogger({
        ...options,
        baseContext: { ...baseContext, ...context },
      }),
  };
}
