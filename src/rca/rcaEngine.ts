// ==============================================================================
// MEI-MCP — Root Cause Analysis Engine
// ==============================================================================
// Deterministic rule-based RCA for MVP.
// Pattern matching on failure signatures with evidence correlation.
// Pluggable LLM-based RCA can be added later.
// ==============================================================================

import type { Evidence, FailureSignature, RcaResult, KnowledgeMatch } from '../agents/types.js';
import { calculateConfidence } from './confidence.js';

/**
 * Known failure signature patterns.
 * Each pattern defines keywords, exit codes, and typical root causes.
 */
const FAILURE_SIGNATURES: FailureSignature[] = [
  {
    pattern: 'oom_killed',
    exitCode: 137,
    keywords: ['oomkilled', 'oom', 'out of memory', 'exit code 137', 'memory limit', 'killed'],
    category: 'Memory Exhaustion',
    typicalCause: 'Container terminated due to memory exhaustion (OOMKilled).',
    recommendedActions: [
      'Increase container memory limit in deployment configuration.',
      'Review recent changes to memory-intensive operations.',
      'Check for memory leaks in the application.',
      'Review resource limits in Helm values or Kubernetes manifests.',
    ],
  },
  {
    pattern: 'image_pull_failure',
    keywords: ['imagepullbackoff', 'image pull', 'errimagepull', 'unauthorized', 'repository does not exist'],
    category: 'Container Image Pull Failure',
    typicalCause: 'Container image could not be pulled from the registry.',
    recommendedActions: [
      'Verify the container image tag exists in the registry.',
      'Check container registry credentials and permissions.',
      'Verify network connectivity to the container registry.',
      'Check if the image was recently deleted or moved.',
    ],
  },
  {
    pattern: 'test_failure',
    exitCode: 1,
    keywords: ['test failed', 'tests failed', 'assertion error', 'expect(', 'test suite failed', 'xunit', 'junit'],
    category: 'Test Failure',
    typicalCause: 'One or more automated tests failed during the build.',
    recommendedActions: [
      'Review the test failure details in the build logs.',
      'Check recent code changes that may have broken tests.',
      'Verify test environment configuration.',
      'Run the failing tests locally to reproduce.',
    ],
  },
  {
    pattern: 'compilation_error',
    exitCode: 1,
    keywords: ['compilation failed', 'build failed', 'syntax error', 'type error', 'cannot find module', 'cs0', 'ts0', 'error cs', 'error ts'],
    category: 'Compilation/Build Error',
    typicalCause: 'Source code failed to compile.',
    recommendedActions: [
      'Review the compilation errors in the build logs.',
      'Check recent code changes for syntax or type errors.',
      'Verify all dependencies are properly installed.',
      'Check for breaking changes in updated packages.',
    ],
  },
  {
    pattern: 'timeout',
    keywords: ['timeout', 'timed out', 'deadline exceeded', 'context deadline', 'operation timed out'],
    category: 'Timeout',
    typicalCause: 'Operation timed out, indicating resource constraints or deadlock.',
    recommendedActions: [
      'Increase timeout values if operations genuinely need more time.',
      'Check for deadlocks or infinite loops in recent changes.',
      'Verify downstream service availability.',
      'Check resource utilization (CPU/memory/disk).',
    ],
  },
  {
    pattern: 'permission_denied',
    keywords: ['permission denied', 'access denied', '403', 'unauthorized', 'forbidden', 'insufficient privileges'],
    category: 'Permission/Access Denied',
    typicalCause: 'The pipeline or application lacks required permissions.',
    recommendedActions: [
      'Verify service principal/managed identity permissions.',
      'Check if access tokens or credentials have expired.',
      'Review RBAC role assignments.',
      'Check if network security rules are blocking access.',
    ],
  },
  {
    pattern: 'disk_pressure',
    keywords: ['disk pressure', 'no space left', 'disk full', 'insufficient disk', 'ephemeral storage'],
    category: 'Disk/Storage Exhaustion',
    typicalCause: 'Node or container ran out of disk space.',
    recommendedActions: [
      'Clean up unused images and containers.',
      'Increase disk size or ephemeral storage limits.',
      'Review log volume and implement log rotation.',
      'Check for large temporary files being created.',
    ],
  },
  {
    pattern: 'crashloop',
    keywords: ['crashloopbackoff', 'crash loop', 'back-off restarting', 'restart count'],
    category: 'CrashLoopBackOff',
    typicalCause: 'Container is repeatedly crashing on startup.',
    recommendedActions: [
      'Check container logs for startup errors.',
      'Verify environment variables and configuration.',
      'Check health/readiness probe configuration.',
      'Review recent deployment changes.',
    ],
  },
  {
    pattern: 'network_error',
    keywords: ['connection refused', 'econnrefused', 'dns resolution', 'name resolution', 'network unreachable', 'enotfound'],
    category: 'Network Error',
    typicalCause: 'Network connectivity issue to a downstream service.',
    recommendedActions: [
      'Verify downstream service is running and healthy.',
      'Check DNS configuration.',
      'Review network security group rules.',
      'Check if the service endpoint has changed.',
    ],
  },
];

/**
 * Root Cause Analysis Engine.
 * Uses deterministic pattern matching on evidence to identify root causes.
 */
export class RcaEngine {
  /**
   * Analyze collected evidence and determine the root cause.
   */
  analyze(
    evidence: Evidence[],
    knowledgeMatches: KnowledgeMatch[]
  ): RcaResult {
    // Combine all evidence text for pattern matching
    const allText = evidence
      .map((e) => `${e.signal} ${e.value}`)
      .join('\n')
      .toLowerCase();

    // Find matching failure signatures
    const matchedSignature = this.findBestSignature(allText, evidence);

    // Determine root cause
    const rootCause = matchedSignature
      ? matchedSignature.typicalCause
      : this.inferRootCause(evidence);

    const failureSignature = matchedSignature
      ? `${matchedSignature.category} (${matchedSignature.pattern})`
      : 'Unknown failure pattern';

    // Calculate confidence
    const patternMatched = matchedSignature !== null;
    const knowledgeConfirmed = knowledgeMatches.length > 0;
    const confidence = calculateConfidence(
      evidence,
      patternMatched,
      knowledgeConfirmed
    );

    // Determine recommended actions
    const recommendedActions = matchedSignature
      ? [...matchedSignature.recommendedActions]
      : ['Review the build logs for detailed error information.', 'Check recent code changes.'];

    // Add knowledge-based recommendations
    if (knowledgeMatches.length > 0) {
      recommendedActions.push(
        `Refer to engineering knowledge: "${knowledgeMatches[0]!.title}" for documented remediation.`
      );
    }

    return {
      rootCause,
      confidence,
      failureSignature,
      evidence,
      relatedChanges: [],
      knowledgeMatches,
      recommendedActions,
    };
  }

  /**
   * Find the best matching failure signature from the evidence.
   */
  private findBestSignature(
    text: string,
    evidence: Evidence[]
  ): FailureSignature | null {
    let bestSignature: FailureSignature | null = null;
    let bestScore = 0;

    for (const sig of FAILURE_SIGNATURES) {
      let score = 0;

      // Keyword matching
      for (const keyword of sig.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Exit code matching
      if (sig.exitCode !== undefined) {
        const exitCodeStr = `exit code ${sig.exitCode}`;
        const exitCodeStr2 = `exitcode ${sig.exitCode}`;
        if (text.includes(exitCodeStr) || text.includes(exitCodeStr2)) {
          score += 3; // Strong signal
        }
      }

      // High-relevance evidence matching
      for (const ev of evidence) {
        if (ev.relevance >= 0.8) {
          const evText = `${ev.signal} ${ev.value}`.toLowerCase();
          for (const keyword of sig.keywords) {
            if (evText.includes(keyword.toLowerCase())) {
              score += 0.5;
            }
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSignature = sig;
      }
    }

    // Require at least 2 keyword matches for a valid signature
    return bestScore >= 2 ? bestSignature : null;
  }

  /**
   * Infer root cause when no known signature matches.
   */
  private inferRootCause(evidence: Evidence[]): string {
    if (evidence.length === 0) {
      return 'Unable to determine root cause — no evidence collected.';
    }

    // Find the highest-relevance evidence
    const sorted = [...evidence].sort((a, b) => b.relevance - a.relevance);
    const primary = sorted[0]!;

    return `Build failure detected. Primary signal: ${primary.signal}. Value: ${primary.value.slice(0, 200)}`;
  }
}
