// ==============================================================================
// MEI-MCP — investigate_application_error Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { executeQuery } from '../connectors/azureMonitor.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const investigateApplicationErrorSchema = z.object({
  appName: z.string().describe('The name of the application or service'),
  lookbackHours: z.number().min(1).max(168).optional().default(2).describe('Time range in hours'),
});

type InvestigateAppErrorArgs = z.infer<typeof investigateApplicationErrorSchema>;

export function registerInvestigateApplicationErrorTool(server: McpServer): void {
  server.registerTool(
    'investigate_application_error',
    {
      description: 'Investigate application exceptions directly from App Insights / Log Analytics.',
      inputSchema: investigateApplicationErrorSchema.shape,
    },
    async (args: unknown, extra: any) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as InvestigateAppErrorArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'investigate_application_error' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('investigate_application_error', userContext.correlationId);
        requireAuthorization(userContext, 'investigate_application_error', parsedArgs.appName);

        const kqlQuery = `
          AppExceptions
          | where AppRoleName contains "${parsedArgs.appName}"
          | where TimeGenerated > ago(${parsedArgs.lookbackHours}h)
          | summarize Count=count() by ExceptionType, ProblemId, OuterMessage
          | order by Count desc
          | limit 10
        `;

        const workspaceId = process.env.AZURE_MONITOR_WORKSPACE_ID;
        if (!workspaceId) {
          throw new Error('AZURE_MONITOR_WORKSPACE_ID is not configured.');
        }

        const queryResults = await executeQuery(workspaceId, kqlQuery);
        success = true;

        if (queryResults.length === 0) {
          return { content: [{ type: 'text', text: `No exceptions found for ${parsedArgs.appName} in the last ${parsedArgs.lookbackHours} hours.` }] };
        }

        const formatted = queryResults.map((r: any) => 
          `- **${r.ExceptionType}** (${r.Count} occurrences): ${r.OuterMessage}`
        ).join('\n');

        return {
          content: [
            { type: 'text', text: `### Top Exceptions for ${parsedArgs.appName}\n${formatted}` }
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
          tool: 'investigate_application_error',
          permissionClass: ToolPermission.READ,
          resource: parsedArgs.appName,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
