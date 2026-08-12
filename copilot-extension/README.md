# MEI-MCP GitHub Copilot Extension

This is a lightweight proxy server that connects **GitHub Copilot Chat** to your **MEI-MCP** server. 

Because GitHub Copilot cannot speak directly to arbitrary MCP servers yet, this proxy uses an LLM (Azure OpenAI) to translate the user's Copilot prompts into MCP tool calls, executes them, and streams the markdown results back to the user's IDE.

## Setup

1. Copy `.env.example` to `.env` (or set these environment variables):
   ```env
   # Where your MEI-MCP server is running
   MCP_SERVER_URL=http://localhost:3001/mcp
   
   # Optional: A static token to authenticate the proxy to the MEI-MCP server
   MCP_AUTH_TOKEN=your-entra-id-token
   
   # Azure OpenAI configuration for the proxy's reasoning loop
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
   AZURE_OPENAI_KEY=your-api-key
   AZURE_OPENAI_DEPLOYMENT=gpt-4o
   
   PORT=3002
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the proxy:
   ```bash
   npm run dev
   ```

## Registering the GitHub App

To make this available to your developers in VS Code / Visual Studio:

1. Go to your GitHub Organization -> **Settings** -> **Developer settings** -> **GitHub Apps**.
2. Click **New GitHub App**.
3. Name it (e.g., `MEI Copilot Agent`).
4. Set the **Homepage URL** to your company website.
5. Disable Webhook (unless you need it for other things).
6. Under **Copilot**, set the **App Type** to `Copilot Chat Extension`.
7. Set the **URL** to the public endpoint where you host this proxy (e.g., `https://mei-proxy.yourcompany.com/api/github/chat`).
8. Save the App.
9. Install the App into your Organization.

Now, any developer in your organization can open GitHub Copilot Chat in VS Code and type:
`@mei investigate pipeline 12345`
