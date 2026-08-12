import express from 'express';
import dotenv from 'dotenv';
import { handleCopilotChat } from './chatHandler.js';

dotenv.config();

const app = express();
app.use(express.json());

// The URL of our published MEI-MCP server
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp';

// GitHub Copilot will send a POST request to this endpoint
app.post('/api/github/chat', async (req, res) => {
  // Validate request is from GitHub (in production, verify the X-GitHub-Token)
  const githubToken = req.headers['x-github-token'] as string;
  const messages = req.body.messages;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Invalid payload: missing messages array' });
    return;
  }

  // We can pass the GitHub token down to the MEI-MCP server if it was configured
  // to validate GitHub tokens, but in our case MEI-MCP uses Entra ID. 
  // For the proxy MVP, we use the server's service identity or pass-through a configured token.
  const mcpAuthHeader = process.env.MCP_AUTH_TOKEN ? `Bearer ${process.env.MCP_AUTH_TOKEN}` : undefined;

  console.log(`Received chat request with ${messages.length} messages.`);
  
  // Hand off to the agentic loop
  await handleCopilotChat(messages, MCP_SERVER_URL, mcpAuthHeader, res);
});

// Health check for GitHub App configuration
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mei-copilot-extension' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`GitHub Copilot Extension proxy running on port ${PORT}`);
  console.log(`Proxying requests to MCP Server at: ${MCP_SERVER_URL}`);
});
