/**
 * Structured JSON logger for Weather MCP Server
 *
 * IMPORTANT: All logs go to stderr because stdout is reserved for MCP protocol communication
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

class Logger {
  private minLevel: LogLevel;
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  /**
   * Write a log entry to stderr
   */
  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    // Write to stderr as JSON
    console.error(JSON.stringify(entry));
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  /**
   * Log an error object with stack trace
   */
  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      errorName: error.name,
      stack: error.stack,
    });
  }

  /**
   * Log tool call start (Phase 9)
   */
  logToolStart(
    toolName: string,
    input: unknown,
    requestId?: string
  ): void {
    // Sanitize input - only log non-sensitive summary
    const inputSummary = this.sanitizeInput(input);

    this.info('Tool call started', {
      requestId,
      toolName,
      inputSummary,
    });
  }

  /**
   * Log tool call end (Phase 9)
   */
  logToolEnd(
    toolName: string,
    latencyMs: number,
    outcome: 'success' | 'error',
    requestId?: string,
    errorCode?: string
  ): void {
    this.info('Tool call completed', {
      requestId,
      toolName,
      latencyMs,
      outcome,
      ...(errorCode && { errorCode }),
    });
  }

  /**
   * Log upstream API call (Phase 9)
   */
  logUpstreamCall(
    upstreamUrl: string,
    upstreamStatus: number,
    latencyMs: number,
    cacheStatus?: 'HIT' | 'MISS' | 'EXPIRED',
    requestId?: string
  ): void {
    this.debug('Upstream API call', {
      requestId,
      upstreamUrl,
      upstreamStatus,
      latencyMs,
      cacheStatus,
    });
  }

  /**
   * Sanitize input to remove sensitive data
   * Only log safe summary fields
   */
  private sanitizeInput(input: unknown): Record<string, unknown> {
    if (typeof input !== 'object' || input === null) {
      return { type: typeof input };
    }

    const safe = input as Record<string, unknown>;
    const summary: Record<string, unknown> = {};

    // Safe fields to log
    const safeFields = [
      'location',
      'timeWindow',
      'resolution',
      'language',
      'activityType',
      'vesselType',
      'query',
      'limit',
    ];

    for (const field of safeFields) {
      if (field in safe) {
        summary[field] = safe[field];
      }
    }

    return summary;
  }
}

// Singleton logger instance
const logger = new Logger();

export { logger };
