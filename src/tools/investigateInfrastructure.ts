// ==============================================================================
// MEI-MCP — investigate_aks_workload Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { InfrastructureInvestigationAgent } from '../agents/infrastructureAgent.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const investigateAksInputSchema = z.object({
  namespace: z.string().min(1).describe('Kubernetes namespace to investigate'),
});

type InvestigateAksArgs = z.infer<typeof investigateAksInputSchema>;

export function registerInvestigateAksTool(server: McpServer): void {
  server.registerTool(
    'investigate_aks_workload',
    {
      description: 'Investigate live AKS workloads for crashes, memory issues, or pod failures.',
      inputSchema: investigateAksInputSchema,
    },
    async (args: unknown, extra: { authInfo?: UserContext }) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as InvestigateAksArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'investigate_aks_workload' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('investigate_aks_workload', userContext.correlationId);
        requireAuthorization(userContext, 'investigate_aks_workload', parsedArgs.namespace);

        const agent = new InfrastructureInvestigationAgent();
        const result = await agent.investigate(parsedArgs.namespace, userContext);

        success = true;

        const summary = [
          `**Cluster Status**: ${result.clusterStatus}`,
          `**Root Cause Analysis**: ${result.rootCause}`,
          '',
          `**Failing Components Detected**: ${result.failingComponents.length}`,
          ...result.failingComponents.map(p => `- Pod: ${p.name} (Restarts: ${p.restarts})`),
          '',
          `**Recommended Actions**:`,
          ...result.recommendedActions.map((a) => `- ${a}`),
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
          tool: 'investigate_aks_workload',
          permissionClass: ToolPermission.READ,
          resource: parsedArgs.namespace,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
