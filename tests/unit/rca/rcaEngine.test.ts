import { describe, it, expect } from 'vitest';
import { RcaEngine } from '../../../src/rca/rcaEngine.js';
import type { Evidence } from '../../../src/agents/types.js';

describe('RCA Engine', () => {
  const engine = new RcaEngine();

  it('identifies OOMKilled from evidence', () => {
    const evidence: Evidence[] = [
      {
        source: 'AzureDevOps',
        timestamp: new Date().toISOString(),
        type: 'log',
        signal: 'Failed task: build',
        value: 'Command failed with exit code 137. OOMKilled.',
        relevance: 0.9
      }
    ];

    const result = engine.analyze(evidence, []);
    
    expect(result.failureSignature).toContain('Memory Exhaustion');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('identifies Test Failure from evidence', () => {
    const evidence: Evidence[] = [
      {
        source: 'AzureDevOps',
        timestamp: new Date().toISOString(),
        type: 'log',
        signal: 'Failed task: test',
        value: 'expect(received).toBe(expected) - test suite failed with exit code 1',
        relevance: 0.9
      }
    ];

    const result = engine.analyze(evidence, []);
    
    expect(result.failureSignature).toContain('Test Failure');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('infers root cause when no known pattern matches', () => {
    const evidence: Evidence[] = [
      {
        source: 'AzureDevOps',
        timestamp: new Date().toISOString(),
        type: 'log',
        signal: 'Failed task: custom_script',
        value: 'Something completely unexpected happened here.',
        relevance: 0.9
      }
    ];

    const result = engine.analyze(evidence, []);
    
    expect(result.failureSignature).toBe('Unknown failure pattern');
    expect(result.rootCause).toContain('completely unexpected');
  });
});
