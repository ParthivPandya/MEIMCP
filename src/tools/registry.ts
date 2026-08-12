// ==============================================================================
// MEI-MCP — Tool Registry
// ==============================================================================

import type { McpServer } from '@modelcontextprotocol/server';
import { registerInvestigatePipelineTool } from './investigatePipeline.js';
import { registerSearchKnowledgeTool } from './searchKnowledge.js';
import { registerAnalyzeDeploymentTool } from './analyzeDeployment.js';
import { registerCreateAdoBugTool } from './createAdoBug.js';
import { registerInvestigateAksTool } from './investigateInfrastructure.js';
import { registerExecuteRemediationTool } from './executeRemediation.js';
import { registerFindSimilarIncidentsTool } from './findSimilarIncidents.js';
import { registerGenerateIncidentReportTool } from './generateIncidentReport.js';

/**
 * Register all available tools on the MCP server instance.
 */
export function registerAllTools(server: McpServer): void {
  registerInvestigatePipelineTool(server);
  registerSearchKnowledgeTool(server);
  registerAnalyzeDeploymentTool(server);
  registerCreateAdoBugTool(server);
  registerInvestigateAksTool(server);
  registerExecuteRemediationTool(server);
  registerFindSimilarIncidentsTool(server);
  registerGenerateIncidentReportTool(server);
}
