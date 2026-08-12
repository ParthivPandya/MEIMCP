// ==============================================================================
// MEI-MCP — create_ado_bug Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { AzureDevOpsConnector } from '../connectors/azureDevOps.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const createAdoBugInputSchema = z.object({
  organization: z.string().min(1).describe('Azure DevOps organization name'),
  project: z.string().min(1).describe('Azure DevOps project name'),
  title: z.string().min(5).max(256).describe('Bug title'),
  description: z.string().min(10).describe('Bug description including reproduction steps'),
  severity: z.enum(['1 - Critical', '2 - High', '3 - Medium', '4 - Low']).describe('Bug severity'),
  areaPath: z.string().optional().describe('Area path in ADO'),
  assignedTo: z.string().email().optional().describe('Email of user to assign'),
});

type CreateAdoBugArgs = z.infer<typeof createAdoBugInputSchema>;

export function registerCreateAdoBugTool(server: McpServer): void {
  server.registerTool(
    'create_ado_bug',
    {
      description: 'Create a bug work item in Azure DevOps.',
      inputSchema: createAdoBugInputSchema,
    },
    async (args: unknown, extra: { authInfo?: UserContext }) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as CreateAdoBugArgs;

      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'create_ado_bug' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('create_ado_bug', userContext.correlationId);
        requireAuthorization(userContext, 'create_ado_bug', parsedArgs.project);

        const ado = new AzureDevOpsConnector();
        const bug = await ado.createBug(
          parsedArgs.organization,
          parsedArgs.project,
          parsedArgs.title,
          parsedArgs.description,
          parsedArgs.severity,
          parsedArgs.areaPath,
          parsedArgs.assignedTo,
          userContext
        );

        success = true;

        return {
          content: [
            { type: 'text', text: `Bug created successfully:\nID: ${bug.id}\nTitle: ${bug.title}\nURL: ${bug.url}` }
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
          tool: 'create_ado_bug',
          permissionClass: ToolPermission.WRITE,
          resource: parsedArgs.project,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
