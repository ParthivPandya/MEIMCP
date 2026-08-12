// ==============================================================================
// MEI-MCP — Tool Policy Engine
// ==============================================================================

import { getConfig } from '../config/configuration.js';
import { PolicyViolationError } from '../errors/index.js';
import { ToolPermission, PermissionPolicy } from '../auth/types.js';

/**
 * Tool registry with permission classes.
 */
const TOOL_REGISTRY: Record<string, { permission: ToolPermission; description: string }> = {
  investigate_pipeline_failure: { permission: ToolPermission.READ, description: 'Investigate pipeline failure' },
  investigate_application_error: { permission: ToolPermission.READ, description: 'Investigate application error' },
  investigate_aks_workload: { permission: ToolPermission.READ, description: 'Investigate AKS workload' },
  search_engineering_knowledge: { permission: ToolPermission.READ, description: 'Search engineering knowledge' },
  find_similar_incidents: { permission: ToolPermission.READ, description: 'Find similar incidents' },
  analyze_recent_deployment: { permission: ToolPermission.READ, description: 'Analyze recent deployment' },
  generate_incident_report: { permission: ToolPermission.PROPOSE, description: 'Generate incident report' },
  create_remediation_plan: { permission: ToolPermission.PROPOSE, description: 'Create remediation plan' },
  create_ado_bug: { permission: ToolPermission.WRITE, description: 'Create ADO bug' },
  create_ado_work_item: { permission: ToolPermission.WRITE, description: 'Create ADO work item' },
  execute_remediation: { permission: ToolPermission.MUTATE, description: 'Execute remediation' },
};

/**
 * Check if a tool is enabled by policy.
 */
export function isToolEnabled(toolName: string): boolean {
  const policy = getToolPolicy(toolName);
  return policy !== PermissionPolicy.DISABLED;
}

/**
 * Get the effective policy for a tool.
 */
export function getToolPolicy(toolName: string): PermissionPolicy {
  const config = getConfig();
  const entry = TOOL_REGISTRY[toolName];
  if (!entry) return PermissionPolicy.DISABLED;

  switch (entry.permission) {
    case ToolPermission.READ:
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
 * Enforce tool policy — throws if the tool is disabled.
 */
export function enforceToolPolicy(
  toolName: string,
  correlationId?: string
): void {
  const policy = getToolPolicy(toolName);

  if (policy === PermissionPolicy.DISABLED) {
    throw new PolicyViolationError(
      `Tool '${toolName}' is disabled by policy.`,
      'tool_permission',
      toolName,
      correlationId
    );
  }
}

/**
 * Get all registered tools and their permission classes.
 */
export function getToolCatalog(): {
  name: string;
  permission: ToolPermission;
  policy: PermissionPolicy;
  description: string;
}[] {
  return Object.entries(TOOL_REGISTRY).map(([name, entry]) => ({
    name,
    permission: entry.permission,
    policy: getToolPolicy(name),
    description: entry.description,
  }));
}
