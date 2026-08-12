// ==============================================================================
// MEI-MCP — MCP Prompt Registry
// ==============================================================================

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export function registerAllPrompts(server: McpServer): void {
  // server.registerPrompt(
    'investigate_incident',
    {
      serviceName: z.string().describe('The name of the service experiencing the incident'),
      severity: z.string().describe('The severity of the incident (e.g. Sev1, Sev2)'),
    },
    (args: { serviceName: string, severity: string }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `We are currently experiencing a ${args.severity} incident involving the ${args.serviceName} service.\n\nPlease follow standard SRE protocol:\n1. Use the 'investigate_application_error' tool to check for recent exceptions.\n2. Use the 'analyze_recent_deployment' tool to check if a release caused this.\n3. If you find a failure signature, use 'find_similar_incidents' to locate runbooks.\n4. Do NOT attempt to mutate any resources without generating a remediation plan first.`
            }
          }
        ]
      };
    }
  );
}
