// ==============================================================================
// MEI-MCP — Custom Error Classes
// ==============================================================================
// All errors carry structured context (error codes, correlation IDs).
// Never leak sensitive information (tokens, secrets) in error messages.
// ==============================================================================

export class MeiMcpError extends Error {
  public readonly code: string;
  public readonly correlationId?: string;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    correlationId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.correlationId = correlationId;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      correlationId: this.correlationId,
    };
  }
}

export class ConfigurationError extends MeiMcpError {
  constructor(message: string, correlationId?: string) {
    super(message, 'CONFIGURATION_ERROR', 500, correlationId);
  }
}

export class AuthenticationError extends MeiMcpError {
  constructor(message: string, correlationId?: string) {
    super(message, 'AUTHENTICATION_ERROR', 401, correlationId);
  }
}

export class AuthorizationError extends MeiMcpError {
  public readonly requiredPermission?: string;
  public readonly resource?: string;

  constructor(
    message: string,
    requiredPermission?: string,
    resource?: string,
    correlationId?: string
  ) {
    super(message, 'AUTHORIZATION_ERROR', 403, correlationId);
    this.requiredPermission = requiredPermission;
    this.resource = resource;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      requiredPermission: this.requiredPermission,
      resource: this.resource,
    };
  }
}

export class ConnectorError extends MeiMcpError {
  public readonly connector: string;
  public readonly downstream?: string;

  constructor(
    message: string,
    connector: string,
    downstream?: string,
    correlationId?: string
  ) {
    super(message, 'CONNECTOR_ERROR', 502, correlationId);
    this.connector = connector;
    this.downstream = downstream;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      connector: this.connector,
      downstream: this.downstream,
    };
  }
}

export class PolicyViolationError extends MeiMcpError {
  public readonly policy: string;
  public readonly action?: string;

  constructor(
    message: string,
    policy: string,
    action?: string,
    correlationId?: string
  ) {
    super(message, 'POLICY_VIOLATION', 403, correlationId);
    this.policy = policy;
    this.action = action;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      policy: this.policy,
      action: this.action,
    };
  }
}

export class RateLimitError extends MeiMcpError {
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    retryAfterMs?: number,
    correlationId?: string
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, correlationId);
    this.retryAfterMs = retryAfterMs;
  }
}

export class ValidationError extends MeiMcpError {
  public readonly field?: string;

  constructor(message: string, field?: string, correlationId?: string) {
    super(message, 'VALIDATION_ERROR', 400, correlationId);
    this.field = field;
  }
}
