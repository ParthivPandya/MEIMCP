// ==============================================================================
// MEI-MCP — analyze_recent_deployment Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { AzureDevOpsConnector } from '../connectors/azureDevOps.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const analyzeDeploymentInputSchema = z.object({
  organization: z.string().min(1).describe('Azure DevOps organization name'),
  project: z.string().min(1).describe('Azure DevOps project name'),
  repositoryId: z.string().min(1).describe('Repository ID'),
  environment: z.enum(['development', 'staging', 'production']).describe('Target environment'),
  lookbackMinutes: z.number().min(10).max(1440).default(120).describe('Minutes to look back for deployments'),
});

type AnalyzeDeploymentArgs = z.infer<typeof analyzeDeploymentInputSchema>;

export function registerAnalyzeDeploymentTool(server: McpServer): void {
  server.registerTool(
    'analyze_recent_deployment',
    {
      description: 'Analyze recent deployments and correlate with observed issues.',
      inputSchema: analyzeDeploymentInputSchema,
    },
    async (args: unknown, extra: { authInfo?: UserContext }) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as AnalyzeDeploymentArgs;

      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'analyze_recent_deployment' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('analyze_recent_deployment', userContext.correlationId);
        requireAuthorization(userContext, 'analyze_recent_deployment', parsedArgs.project);

        const ado = new AzureDevOpsConnector();
        const commits = await ado.getRecentCommits(
          parsedArgs.organization,
          parsedArgs.project,
          parsedArgs.repositoryId,
          10,
          userContext
        );

        success = true;

        const summary = [
          `**Recent Commits in ${parsedArgs.repositoryId}**`,
          ...commits.map(c => `- ${c.commitId.substring(0, 7)} by ${c.author}: ${c.message}`),
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
          tool: 'analyze_recent_deployment',
          permissionClass: ToolPermission.READ,
          resource: parsedArgs.project,
          environment: parsedArgs.environment,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
