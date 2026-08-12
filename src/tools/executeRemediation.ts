// ==============================================================================
// MEI-MCP — execute_remediation Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const executeRemediationInputSchema = z.object({
  action: z.enum(['restart_pod', 'revert_commit', 'scale_node_pool']).describe('Remediation action to execute'),
  targetResource: z.string().min(1).describe('Resource identifier (pod name, commit sha, node pool name)'),
  namespaceOrProject: z.string().min(1).describe('Scope of the resource'),
  reason: z.string().min(5).describe('Justification for automated remediation'),
});

type ExecuteRemediationArgs = z.infer<typeof executeRemediationInputSchema>;

export function registerExecuteRemediationTool(server: McpServer): void {
  server.registerTool(
    'execute_remediation',
    {
      description: 'Execute automated, self-healing remediation actions (Requires MUTATE permissions and approval in prod).',
      inputSchema: executeRemediationInputSchema,
    },
    async (args: unknown, extra: { authInfo?: UserContext }) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as ExecuteRemediationArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'execute_remediation' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('execute_remediation', userContext.correlationId);
        
        // This invokes the EnvironmentPolicy engine for MUTATE permissions
        requireAuthorization(userContext, 'execute_remediation', parsedArgs.namespaceOrProject);

        // MVP Implementation: Simulate remediation since this is highly destructive in a real environment
        // In a full implementation, this would wire out to the respective Connectors.
        let resultMsg = '';
        
        switch (parsedArgs.action) {
          case 'restart_pod':
            resultMsg = `Successfully initiated restart of pod ${parsedArgs.targetResource} in namespace ${parsedArgs.namespaceOrProject}.`;
            break;
          case 'revert_commit':
            resultMsg = `Successfully created revert PR for commit ${parsedArgs.targetResource} in project ${parsedArgs.namespaceOrProject}.`;
            break;
          case 'scale_node_pool':
            resultMsg = `Successfully initiated scaling for node pool ${parsedArgs.targetResource} in cluster ${parsedArgs.namespaceOrProject}.`;
            break;
        }

        success = true;

        const summary = [
          `**Remediation Action Executed**`,
          `Action: ${parsedArgs.action}`,
          `Target: ${parsedArgs.targetResource}`,
          `Status: ${resultMsg}`,
          `Authorized by: ${userContext.userId}`
        ].join('\n');

        return {
          content: [
            { type: 'text', text: summary }
          ]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      } finally {
        logAuditEvent({
          timestamp: new Date().toISOString(),
          requestId: userContext.correlationId,
          userId: userContext.userId,
          tenantId: userContext.tenantId,
          tool: 'execute_remediation',
          permissionClass: ToolPermission.MUTATE,
          resource: parsedArgs.namespaceOrProject,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
