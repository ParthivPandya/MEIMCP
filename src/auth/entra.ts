// ==============================================================================
// MEI-MCP — Entra ID Token Validation
// ==============================================================================
// Validates Microsoft Entra ID (Azure AD) bearer tokens.
// Extracts user context from validated JWT claims.
// Development mode provides configurable auth bypass.
// ==============================================================================

import { AuthenticationError } from '../errors/index.js';
import { getConfig } from '../config/configuration.js';
import { type UserContext, MOCK_USER_CONTEXT } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * Validated JWT token claims from Entra ID.
 */
interface EntraTokenClaims {
  aud: string;
  iss: string;
  oid: string;
  tid: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  roles?: string[];
  scp?: string;
  exp: number;
  nbf: number;
  iat: number;
}

/**
 * Validates incoming bearer tokens and extracts UserContext.
 *
 * In production: validates JWT signature via JWKS, checks audience/issuer/expiry.
 * In development with AUTH_BYPASS_ENABLED: returns a mock user context.
 */
export class EntraTokenValidator {
  private jwksClient: jwksClient.JwksClient | null = null;

  private getJwksClient(): jwksClient.JwksClient {
    if (!this.jwksClient) {
      const config = getConfig();
      const tenantId = config.azure.tenantId || 'common';
      this.jwksClient = jwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 3600000,
        rateLimit: true,
      });
    }
    return this.jwksClient;
  }

  /**
   * Validate a bearer token and return the authenticated user context.
   *
   * @param authHeader - The Authorization header value (e.g., "Bearer eyJ...")
   * @param correlationId - Request correlation ID for tracing
   * @returns Validated UserContext
   * @throws AuthenticationError if the token is invalid, expired, or missing
   */
  async validateToken(
    authHeader: string | undefined,
    correlationId: string
  ): Promise<UserContext> {
    const config = getConfig();

    // Development bypass
    if (config.authBypassEnabled && config.nodeEnv === 'development') {
      return { ...MOCK_USER_CONTEXT, correlationId };
    }

    // Validate header presence
    if (!authHeader) {
      throw new AuthenticationError(
        'Missing Authorization header. Provide a Bearer token.',
        correlationId
      );
    }

    // Extract bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
      throw new AuthenticationError(
        'Invalid Authorization header format. Expected: Bearer <token>',
        correlationId
      );
    }

    const token = parts[1];

    try {
      const claims = await this.verifyAndDecodeToken(token, correlationId);
      return this.extractUserContext(claims, correlationId);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        'Token validation failed. Ensure your token is valid and not expired.',
        correlationId
      );
    }
  }

  /**
   * Verify the JWT signature and decode claims.
   * Uses JWKS endpoint for key resolution.
   */
  private async verifyAndDecodeToken(
    token: string,
    correlationId: string
  ): Promise<EntraTokenClaims> {
    const config = getConfig();

    const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
      if (!header.kid) {
        return callback(new Error('Missing kid in token header'));
      }
      this.getJwksClient().getSigningKey(header.kid, (err, key) => {
        if (err) {
          return callback(err);
        }
        const signingKey = key?.getPublicKey();
        callback(null, signingKey);
      });
    };

    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          audience: config.azure.clientId, // verify audience if specified
          issuer: config.policy.allowedTenantIds.length > 0 
            ? config.policy.allowedTenantIds.map(tid => `https://sts.windows.net/${tid}/`)
            : undefined,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) {
            // Check specific JWT errors
            if (err.name === 'TokenExpiredError') {
              return reject(new AuthenticationError('Token has expired.', correlationId));
            }
            if (err.name === 'JsonWebTokenError') {
              return reject(new AuthenticationError(`Malformed JWT token: ${err.message}`, correlationId));
            }
            if (err.name === 'NotBeforeError') {
              return reject(new AuthenticationError('Token is not yet valid.', correlationId));
            }
            return reject(new AuthenticationError(`Token validation failed: ${err.message}`, correlationId));
          }

          const claims = decoded as EntraTokenClaims;

          // Validate required claims
          if (!claims.oid || !claims.tid) {
            return reject(
              new AuthenticationError('Token missing required claims (oid, tid).', correlationId)
            );
          }

          resolve(claims);
        }
      );
    });
  }

  /**
   * Extract a UserContext from validated Entra ID claims.
   */
  private extractUserContext(
    claims: EntraTokenClaims,
    correlationId: string
  ): UserContext {
    const scopes = claims.scp ? claims.scp.split(' ') : [];

    return {
      userId: claims.oid,
      tenantId: claims.tid,
      displayName: claims.name ?? claims.preferred_username ?? 'Unknown User',
      email:
        claims.email ?? claims.preferred_username ?? 'unknown@unknown.com',
      roles: claims.roles ?? [],
      scopes,
      correlationId,
    };
  }
}

/**
 * Create a user context for development/testing without a real token.
 */
export function createDevUserContext(
  overrides?: Partial<UserContext>
): UserContext {
  return {
    ...MOCK_USER_CONTEXT,
    correlationId: uuidv4(),
    ...overrides,
  };
}
