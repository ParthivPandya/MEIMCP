// ==============================================================================
// MEI-MCP — search_engineering_knowledge Tool
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';
import { KnowledgeSearchEngine } from '../rag/search.js';
import { AzureAISearchConnector } from '../connectors/azureAISearch.js';
import { citationsToMarkdown, formatCitations } from '../rag/citations.js';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { ToolPermission } from '../auth/types.js';
import { enforceToolPolicy } from '../policies/toolPolicy.js';

export const searchKnowledgeInputSchema = z.object({
  query: z.string().min(3).max(500).describe('Search query for engineering knowledge'),
  sources: z.array(z.enum(['wiki', 'sharepoint', 'runbooks', 'incidents'])).optional().describe('Filter by source types'),
  maxResults: z.number().int().min(1).max(20).default(5).describe('Maximum number of results to return'),
});

type SearchKnowledgeArgs = z.infer<typeof searchKnowledgeInputSchema>;

export function registerSearchKnowledgeTool(server: McpServer): void {
  server.registerTool(
    'search_engineering_knowledge',
    {
      description: 'Search the engineering knowledge base (Wiki, runbooks, incidents) using RAG.',
      inputSchema: searchKnowledgeInputSchema,
    },
    async (args: unknown, extra: { authInfo?: UserContext }) => {
      const userContext = extra.authInfo;
      const parsedArgs = args as SearchKnowledgeArgs;

      if (!userContext) {
        logSecurityEvent('unauthenticated_tool_call', { tool: 'search_engineering_knowledge' });
        return { content: [{ type: 'text', text: 'Unauthenticated' }], isError: true };
      }

      const startTime = Date.now();
      let success = false;

      try {
        enforceToolPolicy('search_engineering_knowledge', userContext.correlationId);
        requireAuthorization(userContext, 'search_engineering_knowledge');

        const searchEngine = new KnowledgeSearchEngine(new AzureAISearchConnector());
        
        const results = await searchEngine.search(
          parsedArgs.query,
          {
            sources: parsedArgs.sources,
            maxResults: parsedArgs.maxResults,
          },
          userContext
        );

        success = true;

        const citations = formatCitations(results);
        const markdown = citationsToMarkdown(citations);

        return {
          content: [
            { type: 'text', text: markdown }
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
          tool: 'search_engineering_knowledge',
          permissionClass: ToolPermission.READ,
          durationMs: Date.now() - startTime,
          success,
        });
      }
    }
  );
}
