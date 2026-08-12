import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntraTokenValidator } from '../../src/auth/entra.js';
import { AuthenticationError } from '../../src/errors/index.js';
import * as configModule from '../../src/config/configuration.js';
import type { AppConfig } from '../../../src/config/schema.js';

describe('Security: Token Validation', () => {
  let validator: EntraTokenValidator;

  beforeEach(() => {
    validator = new EntraTokenValidator();
    
    // Mock the config to ensure auth bypass is FALSE for these tests
    vi.spyOn(configModule, 'getConfig').mockReturnValue({
      nodeEnv: 'development',
      authBypassEnabled: false,
      azure: { tenantId: 'test-tenant' },
      policy: { allowedTenantIds: [] },
      // ... other required mock config fields
    } as unknown as AppConfig);
  });

  it('rejects requests without Authorization header', async () => {
    await expect(
      validator.validateToken(undefined, 'req-1')
    ).rejects.toThrow(AuthenticationError);
  });

  it('rejects malformed Authorization headers', async () => {
    await expect(
      validator.validateToken('Basic some-token', 'req-1')
    ).rejects.toThrow(/Invalid Authorization header format/);
    
    await expect(
      validator.validateToken('Bearer', 'req-1')
    ).rejects.toThrow(/Invalid Authorization header format/);
  });

  it('rejects malformed JWT tokens', async () => {
    await expect(
      validator.validateToken('Bearer not.a.real.jwt', 'req-1')
    ).rejects.toThrow(/Malformed JWT token/);
  });
});
