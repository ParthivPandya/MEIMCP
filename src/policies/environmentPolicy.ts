// ==============================================================================
// MEI-MCP — Environment Policy
// ==============================================================================

import type { EnvironmentClass } from '../auth/types.js';
import { ToolPermission } from '../auth/types.js';

export interface EnvironmentPolicyResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

/**
 * Evaluate environment policy for a write/mutate operation.
 */
export function evaluateEnvironmentPolicy(
  permission: ToolPermission,
  environment: EnvironmentClass,
  userRoles: readonly string[]
): EnvironmentPolicyResult {
  // Read and Propose are always allowed
  if (permission === ToolPermission.READ || permission === ToolPermission.PROPOSE) {
    return { allowed: true, requiresApproval: false, reason: 'Read/propose operations are allowed in all environments.' };
  }

  switch (environment) {
    case 'development':
      return { allowed: true, requiresApproval: false, reason: 'Write operations are allowed in development.' };

    case 'staging':
      if (permission === ToolPermission.MUTATE) {
        const hasRole = userRoles.includes('admin') || userRoles.includes('sre');
        return {
          allowed: hasRole,
          requiresApproval: true,
          reason: hasRole ? 'Mutate allowed in staging with approval.' : 'Mutate in staging requires admin or SRE role.',
        };
      }
      return { allowed: true, requiresApproval: true, reason: 'Write allowed in staging with approval.' };

    case 'production':
      if (permission === ToolPermission.MUTATE) {
        const hasAdmin = userRoles.includes('admin');
        return {
          allowed: hasAdmin,
          requiresApproval: true,
          reason: hasAdmin ? 'Mutate allowed in production with admin approval.' : 'Mutate in production requires admin role.',
        };
      }
      {
        const hasRole = userRoles.includes('admin') || userRoles.includes('engineer') || userRoles.includes('sre');
        return {
          allowed: hasRole,
          requiresApproval: true,
          reason: hasRole ? 'Write allowed in production with approval.' : 'Write in production requires engineer, SRE, or admin role.',
        };
      }

    default:
      return { allowed: false, requiresApproval: false, reason: `Unknown environment: ${String(environment)}` };
  }
}
