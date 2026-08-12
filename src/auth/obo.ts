// ==============================================================================
// MEI-MCP — On-Behalf-Of Token Exchange
// ==============================================================================
// Exchanges user tokens for downstream API access tokens using OBO flow.
// Token cache with TTL — never long-lived caching of user tokens.
// ==============================================================================

import { getConfig, isServiceConfigured } from '../config/configuration.js';
import { AuthenticationError } from '../errors/index.js';
import type { UserContext } from './types.js';

/**
 * Downstream API targets for OBO token exchange.
 */
export type DownstreamApi = 'azure-devops' | 'microsoft-graph' | 'azure-management';

/**
 * Scopes required for each downstream API.
 */
const DOWNSTREAM_SCOPES: Record<DownstreamApi, string> = {
  'azure-devops': '499b84ac-1321-427f-aa17-267ca6975798/.default',
  'microsoft-graph': 'https://graph.microsoft.com/.default',
  'azure-management': 'https://management.azure.com/.default',
};

/**
 * Cached token with expiry.
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * On-Behalf-Of token exchange service.
 * Exchanges the user's incoming token for tokens scoped to downstream APIs.
 */
export class OboTokenExchange {
  /** Cache key format: userId:api */
  private readonly cache = new Map<string, CachedToken>();

  /** Buffer before expiry to refresh token (5 minutes). */
  private readonly EXPIRY_BUFFER_MS = 5 * 60 * 1000;

  /**
   * Get a downstream access token for the given API on behalf of the user.
   *
   * In production, this performs the actual OAuth 2.0 OBO flow with Entra ID.
   * In development with auth bypass, returns the original context's correlation ID
   * as a placeholder.
   */
  async getTokenForApi(
    _userContext: UserContext,
    api: DownstreamApi
  ): Promise<string> {
    const config = getConfig();

    // Development bypass
    if (config.authBypassEnabled && config.nodeEnv === 'development') {
      // Return PAT for ADO in dev mode if configured
      if (api === 'azure-devops' && config.ado.pat) {
        return config.ado.pat;
      }
      return `dev-token-${api}`;
    }

    if (!isServiceConfigured('entra')) {
      throw new AuthenticationError(
        'Entra ID is not configured. Cannot perform OBO token exchange.'
      );
    }

    // Check cache
    const cacheKey = `${_userContext.userId}:${api}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + this.EXPIRY_BUFFER_MS) {
      return cached.accessToken;
    }

    // Perform OBO exchange
    const token = await this.performOboExchange(_userContext, api);
    return token;
  }

  /**
   * Perform the actual OBO token exchange with Entra ID.
   *
   * NOTE: Full implementation requires the user's incoming access token
   * (not just the claims). In a production deployment, the MCP transport
   * middleware would pass the raw token through to this method.
   */
  private async performOboExchange(
    userContext: UserContext,
    api: DownstreamApi
  ): Promise<string> {
    const config = getConfig();
    const scope = DOWNSTREAM_SCOPES[api];

    // OBO token endpoint
    const tokenUrl = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: config.azure.clientId!,
      client_secret: config.azure.clientSecret!,
      scope,
      assertion: 'placeholder', // In production, this is the user's incoming JWT
      requested_token_use: 'on_behalf_of',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError(
        `OBO token exchange failed for ${api}: HTTP ${response.status}`,
        userContext.correlationId
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Cache the token
    const cacheKey = `${userContext.userId}:${api}`;
    this.cache.set(cacheKey, {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  }

  /**
   * Clear all cached tokens (e.g., on user sign-out or token revocation).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cached tokens for a specific user.
   */
  clearUserCache(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
