// ==============================================================================
// MEI-MCP — Authorization Engine
// ==============================================================================
// Three-level authorization:
//   Level 1: Tool permission class (READ/PROPOSE/WRITE/MUTATE)
//   Level 2: Resource-level access (projects, subscriptions)
//   Level 3: Environment policy (dev/staging/prod restrictions)
// ==============================================================================

import { AuthorizationError } from '../errors/index.js';
import { getConfig } from '../config/configuration.js';
import {
  type UserContext,
  type AuthorizationResult,
  type EnvironmentClass,
  ToolPermission,
  PermissionPolicy,
} from './types.js';

/**
 * Tool permission registry mapping tool names to their permission class.
 */
const TOOL_PERMISSIONS: ReadonlyMap<string, ToolPermission> = new Map([
  ['investigate_pipeline_failure', ToolPermission.READ],
  ['investigate_application_error', ToolPermission.READ],
  ['investigate_aks_workload', ToolPermission.READ],
  ['search_engineering_knowledge', ToolPermission.READ],
  ['find_similar_incidents', ToolPermission.READ],
  ['analyze_recent_deployment', ToolPermission.READ],
  ['generate_incident_report', ToolPermission.PROPOSE],
  ['create_remediation_plan', ToolPermission.PROPOSE],
  ['create_ado_bug', ToolPermission.WRITE],
  ['create_ado_work_item', ToolPermission.WRITE],
  ['execute_remediation', ToolPermission.MUTATE],
]);

/**
 * Get the permission class for a tool.
 * Unknown tools default to MUTATE (deny-by-default).
 */
export function getToolPermission(toolName: string): ToolPermission {
  return TOOL_PERMISSIONS.get(toolName) ?? ToolPermission.MUTATE;
}

/**
 * Check whether a tool is allowed based on the configured default policy.
 */
function checkToolPolicy(permission: ToolPermission): PermissionPolicy {
  const config = getConfig();

  switch (permission) {
    case ToolPermission.READ:
      return PermissionPolicy.ENABLED;
    case ToolPermission.PROPOSE:
      return PermissionPolicy.ENABLED;
    case ToolPermission.WRITE:
      return config.policy.writeDefault as PermissionPolicy;
    case ToolPermission.MUTATE:
      return config.policy.mutateDefault as PermissionPolicy;
    default:
      return PermissionPolicy.DISABLED;
  }
}

/**
 * Authorize a user to invoke a specific tool.
 * Throws AuthorizationError if denied.
 *
 * @param userContext - The authenticated user
 * @param toolName - The MCP tool being invoked
 * @param resource - Optional resource identifier (e.g., project name)
 * @param environment - Optional environment being targeted
 */
export function authorizeToolInvocation(
  userContext: UserContext,
  toolName: string,
  resource?: string,
  environment?: EnvironmentClass
): AuthorizationResult {
  // ── Level 1: Tool Permission Class ──────────────────────────────────────
  const permission = getToolPermission(toolName);
  const policy = checkToolPolicy(permission);

  if (policy === PermissionPolicy.DISABLED) {
    return {
      allowed: false,
      reason: `Tool '${toolName}' (${permission}) is disabled by policy.`,
      requiredPermission: permission,
    };
  }

  // ── Level 2: Resource Authorization ─────────────────────────────────────
  if (resource) {
    const resourceResult = checkResourceAccess(userContext, resource);
    if (!resourceResult.allowed) {
      return resourceResult;
    }
  }

  // ── Level 3: Environment Policy ─────────────────────────────────────────
  if (environment && permission !== ToolPermission.READ) {
    const envResult = checkEnvironmentPolicy(
      userContext,
      permission,
      environment
    );
    if (!envResult.allowed) {
      return envResult;
    }
  }

  return {
    allowed: true,
    reason: `User authorized for ${toolName} (${permission}).`,
  };
}

/**
 * Authorize and throw if denied. Use this in tool handlers.
 */
export function requireAuthorization(
  userContext: UserContext,
  toolName: string,
  resource?: string,
  environment?: EnvironmentClass
): void {
  const result = authorizeToolInvocation(
    userContext,
    toolName,
    resource,
    environment
  );

  if (!result.allowed) {
    throw new AuthorizationError(
      result.reason,
      result.requiredPermission?.toString(),
      resource,
      userContext.correlationId
    );
  }
}

/**
 * Level 2: Check whether the user has access to a specific resource.
 */
function checkResourceAccess(
  userContext: UserContext,
  resource: string
): AuthorizationResult {
  const config = getConfig();

  // If allowed projects are configured, check against them
  if (config.ado.allowedProjects.length > 0) {
    const projectMatch = config.ado.allowedProjects.some(
      (p) => p.toLowerCase() === resource.toLowerCase()
    );

    if (!projectMatch) {
      return {
        allowed: false,
        reason: `User does not have access to resource '${resource}'.`,
      };
    }
  }

  // Verify user has appropriate scope
  const hasReadScope = userContext.scopes.some(
    (s) => s === 'mei-mcp.read' || s === 'mei-mcp.admin'
  );

  if (!hasReadScope) {
    return {
      allowed: false,
      reason: 'User token does not include required scope.',
    };
  }

  return {
    allowed: true,
    reason: `User has access to resource '${resource}'.`,
  };
}

/**
 * Level 3: Enforce environment-specific policies.
 */
function checkEnvironmentPolicy(
  userContext: UserContext,
  permission: ToolPermission,
  environment: EnvironmentClass
): AuthorizationResult {
  // Read operations are always allowed in any environment
  if (permission === ToolPermission.READ) {
    return {
      allowed: true,
      reason: 'READ operations are allowed in all environments.',
    };
  }

  switch (environment) {
    case 'development':
      // Development: write allowed
      return {
        allowed: true,
        reason: 'Write operations are allowed in development.',
      };

    case 'staging':
      // Staging: write requires confirmation (handled at tool level)
      if (
        permission === ToolPermission.MUTATE &&
        !userContext.roles.includes('admin')
      ) {
        return {
          allowed: false,
          reason:
            'MUTATE operations in staging require admin role.',
          requiredPermission: permission,
        };
      }
      return {
        allowed: true,
        reason: 'Write operation allowed in staging with confirmation.',
      };

    case 'production':
      // Production: write requires approval + privileged role
      if (
        permission === ToolPermission.WRITE &&
        !userContext.roles.includes('engineer') &&
        !userContext.roles.includes('admin')
      ) {
        return {
          allowed: false,
          reason:
            'WRITE operations in production require engineer or admin role.',
          requiredPermission: permission,
        };
      }

      if (
        permission === ToolPermission.MUTATE &&
        !userContext.roles.includes('admin')
      ) {
        return {
          allowed: false,
          reason:
            'MUTATE operations in production require admin role and explicit approval.',
          requiredPermission: permission,
        };
      }
      return {
        allowed: true,
        reason:
          'Write operation allowed in production with privileged role.',
      };

    default:
      return {
        allowed: false,
        reason: `Unknown environment: ${String(environment)}`,
      };
  }
}
