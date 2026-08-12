// ==============================================================================
// MEI-MCP — Audit Logger
// ==============================================================================
// Structured JSON logging using pino.
// Every tool invocation is logged with correlation ID.
// NEVER logs: access tokens, refresh tokens, secrets.
// ==============================================================================

import pino from 'pino';
import { getConfig } from '../config/configuration.js';
import type { AuditEvent } from '../auth/types.js';

let _logger: pino.Logger | null = null;

/**
 * Initialize the audit logger.
 */
export function initLogger(): pino.Logger {
  if (_logger) return _logger;

  let level = 'info';
  try {
    level = getConfig().logLevel;
  } catch {
    // Config might not be loaded yet during startup
  }

  _logger = pino({
    level,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'accessToken',
        'refreshToken',
        'password',
        'secret',
        'apiKey',
        'pat',
        'authorization',
        'cookie',
        '*.accessToken',
        '*.refreshToken',
        '*.password',
        '*.secret',
        '*.apiKey',
        '*.pat',
      ],
      censor: '[REDACTED]',
    },
  });

  return _logger;
}

/**
 * Get the current logger instance.
 */
export function getLogger(): pino.Logger {
  if (!_logger) {
    return initLogger();
  }
  return _logger;
}

/**
 * Log a tool invocation audit event.
 */
export function logAuditEvent(event: AuditEvent): void {
  const logger = getLogger();

  const logData = {
    event: 'mcp.tool.' + (event.success ? 'completed' : 'failed'),
    tool: event.tool,
    user: event.userId,
    tenant: event.tenantId,
    permissionClass: event.permissionClass,
    resource: event.resource,
    environment: event.environment,
    durationMs: event.durationMs,
    success: event.success,
    requestId: event.requestId,
    errorCode: event.errorCode,
    // Truncate error message — never log full stack traces in audit
    errorMessage: event.errorMessage?.slice(0, 500),
  };

  if (event.success) {
    logger.info(logData, `Tool ${event.tool} completed successfully`);
  } else {
    logger.warn(logData, `Tool ${event.tool} failed: ${event.errorCode}`);
  }
}

/**
 * Log a security-relevant event (auth failure, policy violation).
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>
): void {
  const logger = getLogger();
  logger.warn({ event: `mcp.security.${event}`, ...details }, `Security event: ${event}`);
}

/**
 * Create a child logger with a correlation ID bound.
 */
export function createRequestLogger(correlationId: string): pino.Logger {
  return getLogger().child({ correlationId });
}
