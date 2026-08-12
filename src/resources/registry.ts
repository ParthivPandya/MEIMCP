// ==============================================================================
// MEI-MCP — Resources Registry
// ==============================================================================

import type { McpServer } from '@modelcontextprotocol/server';
import { ResourceTemplate } from '@modelcontextprotocol/server';
import { getToolCatalog } from '../policies/toolPolicy.js';

export function registerAllResources(server: McpServer): void {
  // 1. Engineering Services Topology
  server.registerResource(
    'engineering_services',
    'engineering://services',
    {
      title: 'Engineering Services Topology',
      description: 'List of all tracked engineering services',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify([
            { id: 'auth-service', team: 'Identity', tier: 1 },
            { id: 'payment-gateway', team: 'Commerce', tier: 1 },
            { id: 'search-api', team: 'Discovery', tier: 2 },
          ]),
        },
      ],
    })
  );

  // 2. Available Environments
  server.registerResource(
    'engineering_environments',
    'engineering://environments',
    {
      title: 'Engineering Environments',
      description: 'List of available deployment environments and their policies',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify([
            { name: 'development', policy: 'open' },
            { name: 'staging', policy: 'approval_required' },
            { name: 'production', policy: 'strict_approval_required' },
          ]),
        },
      ],
    })
  );

  // 3. Server Configuration & Capabilities
  server.registerResource(
    'engineering_config',
    'engineering://config',
    {
      title: 'Server Configuration & Capabilities',
      description: 'Current tool catalog and enabled capabilities',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            version: '1.0.0',
            tools: getToolCatalog(),
          }),
        },
      ],
    })
  );
  
  // 4. Dynamic Service Resource Template
  server.registerResource(
    'engineering_service_detail',
    new ResourceTemplate('engineering://services/{serviceName}', { list: undefined }),
    {
      title: 'Service Detail',
      description: 'Detailed information for a specific service',
      mimeType: 'application/json'
    },
    async (uri, { serviceName }) => ({
      contents: [{ 
        uri: uri.href, 
        mimeType: 'application/json', 
        text: JSON.stringify({ serviceId: serviceName, repo: `https://dev.azure.com/org/project/_git/${serviceName}` }) 
      }]
    })
  );
}
