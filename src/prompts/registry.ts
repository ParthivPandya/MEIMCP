// ==============================================================================
// MEI-MCP — Prompts Registry
// ==============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';

export function registerAllPrompts(server: McpServer): void {
  // 1. Pipeline Investigation Prompt
  server.registerPrompt(
    'investigate-pipeline',
    {
      title: 'Investigate Pipeline Failure',
      description: 'Start a guided investigation of a pipeline failure',
      argsSchema: z.object({
        organization: z.string().describe('Azure DevOps organization'),
        project: z.string().describe('Azure DevOps project'),
        runId: z.string().describe('Failed pipeline run ID'),
      }),
    },
    ({ organization, project, runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please investigate the pipeline failure in run ${runId} for project ${project} in organization ${organization}.\n\nUse the \`investigate_pipeline_failure\` tool to gather evidence, identify the root cause, and suggest remediation steps. Then summarize the findings for me.`,
          },
        },
      ],
    })
  );

  // 2. Knowledge Search Prompt
  server.registerPrompt(
    'find-known-solution',
    {
      title: 'Find Known Solution',
      description: 'Search engineering knowledge for solutions to an error',
      argsSchema: z.object({
        errorMessage: z.string().describe('The error message or signature'),
      }),
    },
    ({ errorMessage }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I'm seeing the following error:\n\n\`\`\`\n${errorMessage}\n\`\`\`\n\nPlease use the \`search_engineering_knowledge\` tool to find any known solutions, runbooks, or past incidents related to this error.`,
          },
        },
      ],
    })
  );
}
