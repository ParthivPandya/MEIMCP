// ==============================================================================
// MEI-MCP — generate_incident_report Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const generateIncidentReportSchema = z.object({
  title: z.string().describe('Title of the incident'),
  severity: z.enum(['Sev1', 'Sev2', 'Sev3']).describe('Incident severity'),
  rootCause: z.string().describe('The verified root cause of the incident'),
  timeline: z.array(z.string()).describe('List of timeline events'),
  remediation: z.string().describe('Steps taken to resolve the incident'),
});

type GenerateIncidentReportArgs = z.infer<typeof generateIncidentReportSchema>;

export function registerGenerateIncidentReportTool(server: McpServer): void {
  server.registerTool(
    'generate_incident_report',
    {
      description: 'Generate a structured markdown incident report for an outage.',
      inputSchema: generateIncidentReportSchema.shape,
    },
    async (args: unknown, extra: any) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as GenerateIncidentReportArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'generate_incident_report' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('generate_incident_report', userContext.correlationId);
        requireAuthorization(userContext, 'generate_incident_report', 'global');

        success = true;

        const dateStr = new Date().toISOString().split('T')[0];
        const report = `# Incident Postmortem: ${parsedArgs.title}
**Date**: ${dateStr}
**Severity**: ${parsedArgs.severity}
**Author**: ${userContext.displayName} (${userContext.email})

## 1. Executive Summary
An incident occurred that was categorized as **${parsedArgs.severity}**. The root cause was identified as: 
> ${parsedArgs.rootCause}

## 2. Timeline
${parsedArgs.timeline.map(t => `- ${t}`).join('\n')}

## 3. Remediation & Recovery
${parsedArgs.remediation}

## 4. Action Items
- [ ] Review alert thresholds for this failure signature.
- [ ] Add runbook entry to Azure DevOps Wiki.
`;

        return {
          content: [
            { type: 'text', text: report }
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
          tool: 'generate_incident_report',
          permissionClass: ToolPermission.PROPOSE,
          resource: 'global',
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
