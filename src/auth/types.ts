// ==============================================================================
// MEI-MCP — Authentication & Authorization Types
// ==============================================================================

/**
 * Represents an authenticated user's context, extracted from a validated JWT.
 */
export interface UserContext {
  /** Azure AD Object ID of the user. */
  readonly userId: string;
  /** Azure AD Tenant ID. */
  readonly tenantId: string;
  /** User's display name. */
  readonly displayName: string;
  /** User's email address. */
  readonly email: string;
  /** Entra ID roles assigned to the user. */
  readonly roles: readonly string[];
  /** OAuth scopes granted in the token. */
  readonly scopes: readonly string[];
  /** Correlation ID for the current request. */
  readonly correlationId: string;
}

/**
 * Tool permission classification.
 * Each tool must have exactly one of these permission levels.
 */
export enum ToolPermission {
  /** Read-only investigation — always enabled by default. */
  READ = 'READ',
  /** Proposes actions but does not modify anything. */
  PROPOSE = 'PROPOSE',
  /** Writes data (creates work items, etc.) — requires confirmation. */
  WRITE = 'WRITE',
  /** Mutates production infrastructure — disabled by default. */
  MUTATE = 'MUTATE',
}

/**
 * Result of an authorization check.
 */
export interface AuthorizationResult {
  /** Whether the action is allowed. */
  readonly allowed: boolean;
  /** Human-readable reason (for logging and error messages). */
  readonly reason: string;
  /** If denied, what permission would have been required. */
  readonly requiredPermission?: ToolPermission;
}

/**
 * Policy governing how a tool permission level is enforced.
 */
export enum PermissionPolicy {
  /** Tool is enabled, no additional checks needed. */
  ENABLED = 'enabled',
  /** Tool requires explicit user confirmation before execution. */
  CONFIRMATION = 'confirmation',
  /** Tool is disabled entirely. */
  DISABLED = 'disabled',
}

/**
 * Environment classification for policy enforcement.
 */
export type EnvironmentClass = 'development' | 'staging' | 'production';

/**
 * Audit event recorded for every tool invocation.
 */
export interface AuditEvent {
  readonly timestamp: string;
  readonly requestId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly tool: string;
  readonly permissionClass: ToolPermission;
  readonly resource?: string;
  readonly environment?: EnvironmentClass;
  readonly durationMs: number;
  readonly success: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/**
 * Development-mode mock user for auth bypass.
 */
export const MOCK_USER_CONTEXT: UserContext = {
  userId: 'dev-user-00000000-0000-0000-0000-000000000000',
  tenantId: 'dev-tenant-00000000-0000-0000-0000-000000000000',
  displayName: 'Development User',
  email: 'dev@localhost',
  roles: ['engineer', 'admin'],
  scopes: ['mei-mcp.read', 'mei-mcp.write', 'mei-mcp.admin'],
  correlationId: 'dev-correlation-id',
};
