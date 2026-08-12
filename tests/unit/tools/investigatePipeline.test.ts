import { describe, it, expect, vi } from 'vitest';
import { investigatePipelineInputSchema } from '../../../src/tools/investigatePipeline.js';

describe('Tool: investigate_pipeline_failure', () => {
  it('validates correct input schema', () => {
    const result = investigatePipelineInputSchema.safeParse({
      organization: 'contoso',
      project: 'core',
      runId: 12345,
      lookbackHours: 24,
    });
    
    expect(result.success).toBe(true);
  });

  it('rejects invalid runId', () => {
    const result = investigatePipelineInputSchema.safeParse({
      organization: 'contoso',
      project: 'core',
      runId: -1, // invalid
      lookbackHours: 24,
    });
    
    expect(result.success).toBe(false);
  });
});
