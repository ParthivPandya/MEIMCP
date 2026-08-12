// ==============================================================================
// MEI-MCP — Configuration Schema
// ==============================================================================
// Zod schema validating all environment variables at startup.
// Fail-fast with descriptive errors if required config is missing.
// ==============================================================================

import { z } from 'zod';

/**
 * Schema for required and optional configuration values.
 * Validated once at startup — configuration is immutable after initialization.
 */
export const configSchema = z.object({
  // ── Server ──────────────────────────────────────────────────────────────
  port: z
    .string()
    .default('3001')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  nodeEnv: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // ── Microsoft Entra ID ──────────────────────────────────────────────────
  azure: z.object({
    tenantId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
  }),
  authBypassEnabled: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ── Azure DevOps ────────────────────────────────────────────────────────
  ado: z.object({
    organization: z.string().min(1).optional(),
    pat: z.string().min(1).optional(),
    allowedProjects: z
      .string()
      .default('')
      .transform((v) => (v ? v.split(',').map((s) => s.trim()) : [])),
  }),

  // ── Azure Monitor ──────────────────────────────────────────────────────
  monitor: z.object({
    logAnalyticsWorkspaceId: z.string().min(1).optional(),
    subscriptionId: z.string().min(1).optional(),
  }),

  // ── Azure OpenAI ───────────────────────────────────────────────────────
  openai: z.object({
    endpoint: z.string().url().optional(),
    apiKey: z.string().min(1).optional(),
    deploymentName: z.string().default('gpt-4o'),
    embeddingDeployment: z.string().default('text-embedding-3-large'),
    apiVersion: z.string().default('2025-01-01-preview'),
  }),

  // ── Azure AI Search ────────────────────────────────────────────────────
  aiSearch: z.object({
    endpoint: z.string().url().optional(),
    apiKey: z.string().min(1).optional(),
    indexName: z.string().default('engineering-knowledge'),
  }),

  // ── Observability ──────────────────────────────────────────────────────
  observability: z.object({
    appInsightsConnectionString: z.string().optional(),
    otelExporterEndpoint: z.string().url().optional(),
  }),

  // ── Policy ─────────────────────────────────────────────────────────────
  policy: z.object({
    allowedTenantIds: z
      .string()
      .default('')
      .transform((v) => (v ? v.split(',').map((s) => s.trim()) : [])),
    mutateDefault: z
      .enum(['enabled', 'confirmation', 'disabled'])
      .default('disabled'),
    writeDefault: z
      .enum(['enabled', 'confirmation', 'disabled'])
      .default('confirmation'),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Maps raw environment variables to the config schema shape.
 * Call this before passing to `configSchema.parse()`.
 */
export function mapEnvToConfig(env: Record<string, string | undefined>): unknown {
  return {
    port: env['PORT'],
    nodeEnv: env['NODE_ENV'],
    logLevel: env['LOG_LEVEL'],
    azure: {
      tenantId: env['AZURE_TENANT_ID'],
      clientId: env['AZURE_CLIENT_ID'],
      clientSecret: env['AZURE_CLIENT_SECRET'],
    },
    authBypassEnabled: env['AUTH_BYPASS_ENABLED'],
    ado: {
      organization: env['ADO_ORGANIZATION'],
      pat: env['ADO_PAT'],
      allowedProjects: env['ADO_ALLOWED_PROJECTS'],
    },
    monitor: {
      logAnalyticsWorkspaceId: env['AZURE_LOG_ANALYTICS_WORKSPACE_ID'],
      subscriptionId: env['AZURE_SUBSCRIPTION_ID'],
    },
    openai: {
      endpoint: env['AZURE_OPENAI_ENDPOINT'],
      apiKey: env['AZURE_OPENAI_API_KEY'],
      deploymentName: env['AZURE_OPENAI_DEPLOYMENT_NAME'],
      embeddingDeployment: env['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'],
      apiVersion: env['AZURE_OPENAI_API_VERSION'],
    },
    aiSearch: {
      endpoint: env['AZURE_AI_SEARCH_ENDPOINT'],
      apiKey: env['AZURE_AI_SEARCH_API_KEY'],
      indexName: env['AZURE_AI_SEARCH_INDEX_NAME'],
    },
    observability: {
      appInsightsConnectionString: env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
      otelExporterEndpoint: env['OTEL_EXPORTER_OTLP_ENDPOINT'],
    },
    policy: {
      allowedTenantIds: env['ALLOWED_TENANT_IDS'],
      mutateDefault: env['POLICY_MUTATE_DEFAULT'],
      writeDefault: env['POLICY_WRITE_DEFAULT'],
    },
  };
}
