// ==============================================================================
// MEI-MCP — create_remediation_plan Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const createRemediationPlanSchema = z.object({
  service: z.string().describe('The affected service'),
  issueDescription: z.string().describe('Description of the issue'),
  proposedSteps: z.array(z.string()).describe('The discrete steps proposed for remediation'),
  riskLevel: z.enum(['Low', 'Medium', 'High']).describe('Assessed risk level of the remediation'),
});

type CreateRemediationPlanArgs = z.infer<typeof createRemediationPlanSchema>;

export function registerCreateRemediationPlanTool(server: McpServer): void {
  server.registerTool(
    'create_remediation_plan',
    {
      description: 'Propose a non-mutating remediation plan for human review before execution.',
      inputSchema: createRemediationPlanSchema.shape,
    },
    async (args: unknown, extra: any) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as CreateRemediationPlanArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'create_remediation_plan' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('create_remediation_plan', userContext.correlationId);
        requireAuthorization(userContext, 'create_remediation_plan', parsedArgs.service);

        success = true;

        const plan = `
# Remediation Plan: ${parsedArgs.service}
**Risk Level**: ${parsedArgs.riskLevel}
**Issue**: ${parsedArgs.issueDescription}

## Execution Steps
${parsedArgs.proposedSteps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}

> **Notice**: This is a PROPOSED plan. To execute this, the AI must invoke the \`execute_remediation\` tool, which requires explicit user authorization.
`;

        return {
          content: [{ type: 'text', text: plan }]
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
          tool: 'create_remediation_plan',
          permissionClass: ToolPermission.PROPOSE,
          resource: parsedArgs.service,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
