// ==============================================================================
// MEI-MCP — Server Factory
// ==============================================================================
// Factory function that creates a fresh McpServer instance per request.
// ==============================================================================

import { McpServer } from '@modelcontextprotocol/server';
import { registerAllTools } from './tools/registry.js';
import { registerAllResources } from './resources/registry.js';
import { registerAllPrompts } from './prompts/registry.js';
import type { UserContext } from './auth/types.js';

/**
 * Creates a fresh MCP Server instance for a specific authenticated caller.
 * This function runs once per HTTP request in the Streamable HTTP transport model.
 * 
 * @param authInfo - The authenticated user context (if present)
 * @returns A fully configured McpServer instance
 */
export function createMeiServer(authInfo?: UserContext): McpServer {
  const server = new McpServer(
    { name: 'mei-mcp', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Register all capabilities on this instance
  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  return server;
}
