# Microsoft Engineering Intelligence MCP (MEI-MCP)

A production-grade, bug-free Model Context Protocol (MCP) server providing a unified AI interface over Microsoft engineering ecosystems (Azure DevOps, Azure Monitor, Azure AI Search, Microsoft Graph).

This server allows AI clients (like VS Code/Copilot, Cursor, Claude, or custom agents) to securely interact with your engineering tools to perform complex tasks like Root Cause Analysis (RCA) on pipeline failures.

## Features

- **MCP v2 Compliant**: Built on `@modelcontextprotocol/server` with Streamable HTTP transport via Express.
- **Strict Authorization**: Three-level auth model (Tool Permission, Resource RBAC, Environment Policy) via Microsoft Entra ID.
- **Azure DevOps Connector**: Full read/write capabilities (with confirmation) for pipelines, timelines, repositories, and work items.
- **RCA Engine**: Deterministic pattern matching on failure signatures correlated with logs and metrics.
- **RAG Knowledge**: Security-scoped hybrid search using Azure AI Search.
- **Audit Logging**: OpenTelemetry metrics and structured JSON logging.

## Local Development

### Prerequisites
- Node.js 20+
- Access to an Azure Tenant
- Azure DevOps Organization (optional, but needed for full testing)

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your values
   - Set `AUTH_BYPASS_ENABLED=true` for local development if you don't have Entra ID configured yet.
4. Run the server: `npm run dev`

### Testing
- Run unit tests: `npm run test:unit`
- Run integration tests: `npm run test:integration`
- Verify types: `npm run typecheck`

### Interacting with the Server
Use the MCP Inspector to test the tools locally:
```bash
npx @modelcontextprotocol/inspector npx tsx src/server.ts
```

## Security

This project implements strict security controls:
1. **Never** passes user input directly into KQL or search queries (parameterization).
2. **Denies** mutating actions by default.
3. **Requires** explicit human confirmation for WRITE actions.
4. Redacts all secrets and tokens from audit logs.
