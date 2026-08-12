// ==============================================================================
// MEI-MCP — Express Server Entrypoint
// ==============================================================================

import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { v4 as uuidv4 } from 'uuid';

import { loadConfig, isDevelopment } from './config/configuration.js';
import { EntraTokenValidator } from './auth/entra.js';
import { createMeiServer } from './factory.js';
import { initLogger, createRequestLogger, logSecurityEvent } from './audit/auditLogger.js';
import { initTelemetry, shutdownTelemetry } from './audit/telemetry.js';

// ── 1. Initialization ────────────────────────────────────────────────────────

const config = loadConfig();
const logger = initLogger();
initTelemetry();

const tokenValidator = new EntraTokenValidator();

// ── 2. Express Setup ─────────────────────────────────────────────────────────

// Use createMcpExpressApp which provides DNS rebinding protection and JSON parsing
const app = createMcpExpressApp();

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Request ID middleware
app.use((req, res, next) => {
  const reqId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-correlation-id'] = reqId; // Expose to downstream
  next();
});

// ── 3. Health Endpoints ──────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', (req, res) => {
  // In a real implementation, we would check connector connectivity here
  res.status(200).json({ status: 'ready', connectors: 'ok' });
});

app.get('/version', (req, res) => {
  res.status(200).json({ name: 'mei-mcp', version: '1.0.0' });
});

// ── 4. MCP Transport (Streamable HTTP) ───────────────────────────────────────

// Create the MCP handler using our factory
const mcpHandler = createMcpHandler(async ({ requestInfo }) => {
  const req = requestInfo as Request;
  const correlationId = (req.headers.get('x-correlation-id') as string) || uuidv4();
  const authHeader = req.headers.get('authorization') || undefined;

  let authInfo;
  try {
    authInfo = await tokenValidator.validateToken(authHeader, correlationId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown authentication error';
    logSecurityEvent('authentication_failed', { correlationId, reason: msg });
    
    // In strict mode, we might throw here to block the connection completely.
    // However, MCP standard allows the server to connect but refuse tool execution later.
    // We let the connection proceed without authInfo; tools will reject unauthenticated calls.
  }

  // Create and return the server instance for this request
  return createMeiServer(authInfo);
});

const nodeHandler = toNodeHandler(mcpHandler);

// Mount the MCP handler on the /mcp route
app.all('/mcp', (req, res) => void nodeHandler(req, res, req.body));

// ── 5. Server Lifecycle ──────────────────────────────────────────────────────

const port = config.port;

const server = app.listen(port, () => {
  logger.info(`MEI-MCP server listening on port ${port} in ${config.nodeEnv} mode`);
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    await mcpHandler.close(); // Close active MCP connections
    await shutdownTelemetry();
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
