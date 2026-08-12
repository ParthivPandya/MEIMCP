import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeToolInvocation } from '../../../src/auth/authorization.js';
import { ToolPermission } from '../../../src/auth/types.js';
import { MOCK_USER_CONTEXT } from '../../../src/auth/types.js';
import * as configModule from '../../../src/config/configuration.js';
import type { AppConfig } from '../../../src/config/schema.js';

describe('Authorization Engine', () => {
  beforeEach(() => {
    vi.spyOn(configModule, 'getConfig').mockReturnValue({
      policy: {
        writeDefault: 'confirmation',
        mutateDefault: 'disabled',
        allowedTenantIds: []
      },
      ado: {
        allowedProjects: []
      }
    } as unknown as AppConfig);
  });
  it('allows READ operations without restrictions', () => {
    const result = authorizeToolInvocation(
      MOCK_USER_CONTEXT,
      'investigate_pipeline_failure',
      'test-project',
      'production'
    );
    expect(result.allowed).toBe(true);
  });

  it('allows WRITE operations in development environment', () => {
    const result = authorizeToolInvocation(
      MOCK_USER_CONTEXT,
      'create_ado_bug',
      'test-project',
      'development'
    );
    expect(result.allowed).toBe(true);
  });

  it('allows WRITE operations in production for engineers', () => {
    const engineerContext = { ...MOCK_USER_CONTEXT, roles: ['engineer'] };
    const result = authorizeToolInvocation(
      engineerContext,
      'create_ado_bug',
      'test-project',
      'production'
    );
    expect(result.allowed).toBe(true);
  });

  it('denies WRITE operations in production for non-engineers', () => {
    const viewerContext = { ...MOCK_USER_CONTEXT, roles: ['viewer'] };
    const result = authorizeToolInvocation(
      viewerContext,
      'create_ado_bug',
      'test-project',
      'production'
    );
    expect(result.allowed).toBe(false);
    expect(result.requiredPermission).toBe(ToolPermission.WRITE);
  });
});
