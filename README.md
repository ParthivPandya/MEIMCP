# Microsoft Engineering Intelligence MCP (MEI-MCP)

A production-grade, bug-free Model Context Protocol (MCP) server providing a unified AI interface over Microsoft engineering ecosystems (Azure DevOps, Azure Monitor, Azure AI Search, Microsoft Graph).

This server allows AI clients (like VS Code/Copilot, Cursor, Claude, or custom agents) to securely interact with your engineering tools to perform complex tasks like Root Cause Analysis (RCA) on pipeline failures.

## 🌟 The Vision: Why is this helpful?

Most AI coding assistants live purely in the codebase. But engineering problems rarely exist only in the code—they span across CI/CD pipelines, live infrastructure, logs, and internal documentation.

Instead of building separate chatbots or plugins for every tool, **MEI-MCP** exposes a single, secure endpoint that allows your AI to become an **SRE and DevOps expert**. 

### Example Use Case
When a developer asks their AI: > *"Why did pipeline #48291 fail?"*

Using MEI-MCP, the AI will autonomously:
1. Fetch the pipeline execution and build logs from **Azure DevOps**.
2. Identify the failure signature (e.g., OOMKilled).
3. Inspect live infrastructure health in **Azure Kubernetes Service (AKS)**.
4. Query **Azure Monitor / Log Analytics** for application exceptions.
5. Search the **Azure DevOps Wiki** for known runbooks regarding this specific failure.
6. Present the developer with a correlated root-cause analysis, and offer to **safely restart the pod** or **create a bug**.

## 🚀 Features

- **MCP v2 Compliant**: Built on `@modelcontextprotocol/server` with Streamable HTTP transport via Express.
- **Strict Authorization**: Three-level auth model (Tool Permission, Resource RBAC, Environment Policy) via Microsoft Entra ID.
- **Azure DevOps Connector**: Full read/write capabilities (with confirmation) for pipelines, timelines, repositories, and work items.
- **RCA Engine**: Deterministic pattern matching on failure signatures correlated with logs and metrics.
- **Live Infrastructure Investigation**: Integrates directly with Azure Kubernetes Service (AKS) for pod-level debugging.
- **RAG Knowledge**: Security-scoped hybrid search using Azure AI Search.
- **Self-Healing Automation**: Securely execute remediation (like pod restarts) via policy-gated mutation.
- **Audit Logging**: OpenTelemetry metrics and structured JSON logging.

## Architecture

```text
+---------------------------------------------------------------+
|                        AI CLIENTS                             |
|                                                               |
| VS Code / GitHub Copilot | Cursor | Claude | Custom Agents   |
+-------------------------------+-------------------------------+
                                |
                                | MCP / Streamable HTTP
                                v
+---------------------------------------------------------------+
|           Microsoft Engineering Intelligence MCP              |
|                                                               |
| +----------------+  +----------------+  +------------------+ |
| | MCP Protocol   |  | Authentication |  | Policy Engine    | |
| | Server         |  | / Entra ID     |  | / RBAC           | |
| +----------------+  +----------------+  +------------------+ |
|                                                               |
| +-----------------------------------------------------------+ |
| |                    Intent Router                           | |
| +-----------------------------------------------------------+ |
|                                                               |
| +----------------+ +----------------+ +--------------------+ |
| | Pipeline Agent | | Cloud/SRE Agent| | Knowledge Agent    | |
| +----------------+ +----------------+ +--------------------+ |
|                                                               |
| +----------------+ +----------------+ +--------------------+ |
| | RCA Engine     | | RAG Engine     | | Action Engine      | |
| +----------------+ +----------------+ +--------------------+ |
+---------------------------+-----------------------------------+
                            |
         +------------------+------------------+
         |                  |                  |
         v                  v                  v
+----------------+ +------------------+ +---------------------+
| Azure DevOps   | | Azure Platform   | | Microsoft Graph     |
|                | |                  | |                     |
| Pipelines      | | ARM              | | SharePoint          |
| Repos          | | AKS              | | Teams               |
+----------------+ | Monitor          | +---------------------+
                   +------------------+
```

## Available Tools (MCP Tool Catalog)

MEI-MCP exposes **engineering-level** tools rather than low-level REST APIs to give AI agents maximum context with minimal prompt overhead.

| Tool Name | Permission | Description |
|-----------|------------|-------------|
| `investigate_pipeline_failure` | **READ** | Investigates a pipeline failure across logs, telemetry, and knowledge. |
| `investigate_aks_workload` | **READ** | Investigates CrashLoopBackOff, OOMKilled, and pod failures in AKS. |
| `analyze_recent_deployment` | **READ** | Correlates a failure to recent deployments and commits. |
| `search_engineering_knowledge` | **READ** | Hybrid search across internal Wiki and incident history. |
| `create_ado_bug` | **WRITE** | Creates an Azure DevOps bug (requires explicit confirmation). |
| `execute_remediation` | **MUTATE** | Automated self-healing, such as reverting commits or restarting pods. |

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

## Security & Authorization Model

This project implements strict security controls via a **3-Tier Authorization Architecture**:

1. **Level 1 — MCP Tool Permission**
   Tools are strictly categorized into `READ`, `PROPOSE`, `WRITE`, and `MUTATE`. For example, `investigate_pipeline` requires `READ`, while `execute_remediation` requires `MUTATE`.
   
2. **Level 2 — Resource Authorization (RBAC)**
   Validates that the authenticated Microsoft Entra ID user is actually allowed to access the specific resource (e.g., Azure DevOps Project A vs Project B).
   
3. **Level 3 — Environment Policy**
   Even if a user has access, the environment policy dictates execution rules:
   - **Development**: WRITE/MUTATE allowed.
   - **Staging**: WRITE requires human confirmation.
   - **Production**: WRITE/MUTATE requires human confirmation *and* a privileged Entra ID role.

**Additional Guardrails**:
- **Never** passes user input directly into KQL or search queries (parameterization).
- Redacts all secrets and tokens from audit logs.
