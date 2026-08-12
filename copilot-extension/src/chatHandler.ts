import OpenAI from 'openai';
import { McpClientWrapper } from './mcpClient.js';
import type { Response } from 'express';

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY || '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || '';

// Initialize OpenAI client for Azure
const aiClient = new OpenAI({
  apiKey: AZURE_OPENAI_KEY,
  baseURL: `${AZURE_OPENAI_ENDPOINT.replace(/\/$/, '')}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { 'api-version': '2025-01-01-preview' },
  defaultHeaders: { 'api-key': AZURE_OPENAI_KEY },
});

export async function handleCopilotChat(
  messages: any[],
  mcpServerUrl: string,
  authHeader: string | undefined,
  res: Response
) {
  const mcp = new McpClientWrapper(mcpServerUrl);
  
  try {
    // 1. Connect to MEI-MCP
    await mcp.connect(authHeader);

    // 2. Fetch available tools
    const toolsResponse = await mcp.listTools();
    
    // Map MCP tools to OpenAI function calling schema
    const functions = toolsResponse.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));

    // 3. First LLM Pass: Does the user need a tool?
    // Write SSE headers for Copilot (GitHub format)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // System prompt instructing the model to act as the Engineering Intelligence Agent
    const systemPrompt = {
      role: 'system',
      content: 'You are MEI (Microsoft Engineering Intelligence), a GitHub Copilot Chat Extension. You have access to tools that can investigate pipelines, Azure infrastructure, and engineering knowledge. When a user asks a question, always try to use your tools to find the answer. Summarize the tool results neatly in Markdown.'
    };

    const chatHistory = [systemPrompt, ...messages];

    const response = await aiClient.chat.completions.create({
      model: AZURE_OPENAI_DEPLOYMENT,
      messages: chatHistory as any,
      functions
    });

    const choice = response.choices[0];

    if (choice?.message?.function_call) {
      const fn = choice.message.function_call;
      
      // Let Copilot know we are using a tool
      res.write(`data: ${JSON.stringify({ type: 'progress', message: `Calling tool: ${fn.name}...` })}\n\n`);
      
      // 4. Execute the tool on the MEI-MCP server
      const args = JSON.parse(fn.arguments || '{}');
      const toolResult = await mcp.callTool(fn.name, args);
      
      // Extract text content from tool result
      const toolText = Array.isArray(toolResult.content) 
        ? toolResult.content.map((c: any) => c.text).join('\n')
        : JSON.stringify(toolResult.content);

      // 5. Second LLM Pass: Summarize the tool result
      chatHistory.push(choice.message);
      chatHistory.push({
        role: 'function',
        name: fn.name,
        content: toolText
      });

      res.write(`data: ${JSON.stringify({ type: 'progress', message: `Analyzing results...` })}\n\n`);

      const finalResponse = await aiClient.chat.completions.create({
        model: AZURE_OPENAI_DEPLOYMENT,
        messages: chatHistory as any
      });

      const finalMessage = finalResponse.choices[0]?.message?.content || 'No response generated.';
      
      // Stream the final result to Copilot
      res.write(`data: ${JSON.stringify({ type: 'message', content: finalMessage })}\n\n`);
    } else {
      // No tool needed, just reply
      const finalMessage = choice?.message?.content || 'No response generated.';
      res.write(`data: ${JSON.stringify({ type: 'message', content: finalMessage })}\n\n`);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`);
  } finally {
    await mcp.close();
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
}
