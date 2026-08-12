// ==============================================================================
// MEI-MCP — find_similar_incidents Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { searchKnowledgeBase } from '../rag/search.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const findSimilarIncidentsSchema = z.object({
  query: z.string().min(3).describe('Failure signature, error message, or stack trace'),
  service: z.string().optional().describe('Filter by specific service or component'),
  top: z.number().min(1).max(10).optional().default(3).describe('Number of incidents to return'),
});

type FindSimilarIncidentsArgs = z.infer<typeof findSimilarIncidentsSchema>;

export function registerFindSimilarIncidentsTool(server: McpServer): void {
  server.registerTool(
    'find_similar_incidents',
    {
      description: 'Find similar historical incidents or postmortems matching a failure signature.',
      inputSchema: findSimilarIncidentsSchema.shape,
    },
    async (args: unknown, extra: any) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as FindSimilarIncidentsArgs;
      
      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'find_similar_incidents' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('find_similar_incidents', userContext.correlationId);
        requireAuthorization(userContext, 'find_similar_incidents', parsedArgs.service || 'global');

        // Augment query to focus on incidents
        const augmentedQuery = `Incident Postmortem Outage ${parsedArgs.service || ''} ${parsedArgs.query}`;
        const results = await searchKnowledgeBase(augmentedQuery, parsedArgs.top);

        success = true;

        if (results.length === 0) {
          return { content: [{ type: 'text', text: 'No similar historical incidents found.' }] };
        }

        const formattedResults = results.map((r, i) => {
          return `### [${i + 1}] ${r.title}\n**Source**: ${r.url}\n**Relevance**: ${(r.score * 100).toFixed(1)}%\n\n${r.content}\n`;
        }).join('\n---\n');

        return {
          content: [
            { type: 'text', text: `Found ${results.length} similar incident(s):\n\n${formattedResults}` }
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
          tool: 'find_similar_incidents',
          permissionClass: ToolPermission.READ,
          resource: parsedArgs.service || 'global',
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
