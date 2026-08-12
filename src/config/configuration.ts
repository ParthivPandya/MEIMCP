// ==============================================================================
// MEI-MCP — Configuration Singleton
// ==============================================================================
// Typed configuration loaded from validated environment variables.
// Immutable after initialization — no runtime mutations.
// ==============================================================================

import { ConfigurationError } from '../errors/index.js';
import { type AppConfig, configSchema, mapEnvToConfig } from './schema.js';

let _config: AppConfig | null = null;

/**
 * Load and validate configuration from environment variables.
 * Must be called once at startup. Throws `ConfigurationError` on invalid config.
 */
export function loadConfig(env?: Record<string, string | undefined>): AppConfig {
  const source = env ?? (process.env as Record<string, string | undefined>);
  const raw = mapEnvToConfig(source);
  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigurationError(
      `Invalid configuration:\n${issues}\n\nSee .env.example for required values.`
    );
  }

  _config = Object.freeze(result.data) as AppConfig;
  return _config;
}

/**
 * Get the loaded configuration.
 * Throws if `loadConfig()` has not been called.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new ConfigurationError(
      'Configuration not loaded. Call loadConfig() at startup.'
    );
  }
  return _config;
}

/**
 * Check whether a specific Azure service is configured and available.
 */
export function isServiceConfigured(
  service: 'ado' | 'monitor' | 'openai' | 'aiSearch' | 'entra'
): boolean {
  const config = getConfig();

  switch (service) {
    case 'ado':
      return !!(config.ado.organization && config.ado.pat);
    case 'monitor':
      return !!(config.monitor.logAnalyticsWorkspaceId && config.monitor.subscriptionId);
    case 'openai':
      return !!(config.openai.endpoint && config.openai.apiKey);
    case 'aiSearch':
      return !!(config.aiSearch.endpoint && config.aiSearch.apiKey);
    case 'entra':
      return !!(config.azure.tenantId && config.azure.clientId);
    default:
      return false;
  }
}

/**
 * Check if we are running in development mode.
 */
export function isDevelopment(): boolean {
  return getConfig().nodeEnv === 'development';
}

/**
 * Check if we are running in production mode.
 */
export function isProduction(): boolean {
  return getConfig().nodeEnv === 'production';
}

/**
 * Reset config (for testing only).
 */
export function resetConfig(): void {
  _config = null;
}
