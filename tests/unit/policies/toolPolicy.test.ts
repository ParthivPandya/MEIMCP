import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isToolEnabled, getToolPolicy } from '../../../src/policies/toolPolicy.js';
import { PermissionPolicy } from '../../../src/auth/types.js';
import * as configModule from '../../../src/config/configuration.js';
import type { AppConfig } from '../../../src/config/schema.js';

describe('Tool Policy Engine', () => {
  beforeEach(() => {
    vi.spyOn(configModule, 'getConfig').mockReturnValue({
      policy: {
        writeDefault: 'confirmation',
        mutateDefault: 'disabled'
      }
    } as unknown as AppConfig);
  });
  it('enables investigate_pipeline_failure by default', () => {
    expect(isToolEnabled('investigate_pipeline_failure')).toBe(true);
    expect(getToolPolicy('investigate_pipeline_failure')).toBe(PermissionPolicy.ENABLED);
  });

  it('requires confirmation for create_ado_bug by default', () => {
    expect(isToolEnabled('create_ado_bug')).toBe(true);
    expect(getToolPolicy('create_ado_bug')).toBe(PermissionPolicy.CONFIRMATION);
  });

  it('disables execute_remediation by default', () => {
    expect(isToolEnabled('execute_remediation')).toBe(false);
    expect(getToolPolicy('execute_remediation')).toBe(PermissionPolicy.DISABLED);
  });

  it('handles unknown tools safely (deny-by-default)', () => {
    expect(isToolEnabled('unknown_dangerous_tool')).toBe(false);
    expect(getToolPolicy('unknown_dangerous_tool')).toBe(PermissionPolicy.DISABLED);
  });
});
