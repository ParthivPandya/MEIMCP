// ==============================================================================
// MEI-MCP — MCP Resource Registry
// ==============================================================================

import type { McpServer } from '@modelcontextprotocol/server';
import { logAuditEvent, logSecurityEvent } from '../audit/auditLogger.js';
import { requireAuthorization } from '../auth/authorization.js';
import type { UserContext } from '../auth/types.js';

export function registerAllResources(server: McpServer): void {
  // server.registerResource(
    'incident',
    'incident://{id}',
    async (uri: URL, extra: { authInfo?: UserContext }) => {
      const id = uri.hostname;
      
      const userContext = extra.authInfo;
      if (!userContext) {
        throw new Error('Unauthenticated access to resource');
      }

      // 1. Authorization check
      requireAuthorization(userContext, 'read_incident', id);

      // 2. Audit logging
      logAuditEvent({
        timestamp: new Date().toISOString(),
        requestId: userContext.correlationId,
        userId: userContext.userId,
        tenantId: userContext.tenantId,
        tool: 'resource:incident',
        permissionClass: 'READ' as any,
        resource: id,
        durationMs: 0,
        success: true,
      });

      // 3. Return the content
      return {
        contents: [{
          uri: uri.href,
          text: `Historical Postmortem for Incident ${id}\n\nRoot Cause: Out of Memory...`
        }]
      };
    }
  );
}
