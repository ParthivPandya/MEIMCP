// ==============================================================================
// MEI-MCP — investigate_pipeline_failure Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { PipelineInvestigationAgent } from '../agents/pipelineAgent.js';
import { AzureDevOpsConnector } from '../connectors/azureDevOps.js';
import { AzureMonitorConnector } from '../connectors/azureMonitor.js';
import { AzureAISearchConnector } from '../connectors/azureAISearch.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const investigatePipelineInputSchema = z.object({
  organization: z.string().min(1).describe('Azure DevOps organization name'),
  project: z.string().min(1).describe('Azure DevOps project name'),
  runId: z.number().int().positive().describe('Pipeline run ID'),
  lookbackHours: z.number().min(1).max(72).default(4).describe('Hours to look back for related telemetry'),
});

type InvestigatePipelineArgs = z.infer<typeof investigatePipelineInputSchema>;

export function registerInvestigatePipelineTool(server: McpServer): void {
  server.registerTool(
    'investigate_pipeline_failure',
    {
      description: 'Investigate a pipeline failure using telemetry, logs, and knowledge base.',
      inputSchema: investigatePipelineInputSchema,
    },
    async (args: unknown, extra: { authInfo?: UserContext }) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as InvestigatePipelineArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'investigate_pipeline_failure' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('investigate_pipeline_failure', userContext.correlationId);
        requireAuthorization(userContext, 'investigate_pipeline_failure', parsedArgs.project);

        const agent = new PipelineInvestigationAgent({
          pipelineConnector: new AzureDevOpsConnector(),
          monitorConnector: new AzureMonitorConnector(),
          searchConnector: new AzureAISearchConnector(),
        });

        const result = await agent.investigate({
          ...parsedArgs,
          userContext,
        });

        success = true;

        const summary = [
          `**Pipeline Status**: ${result.status}`,
          `**Root Cause Analysis**: ${result.rootCause}`,
          `**Confidence**: ${Math.round(result.confidence * 100)}%`,
          `**Failure Signature**: ${result.failureSignature}`,
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
          tool: 'investigate_pipeline_failure',
          permissionClass: ToolPermission.READ,
          resource: parsedArgs.project,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
