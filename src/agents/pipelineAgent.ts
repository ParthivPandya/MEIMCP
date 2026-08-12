// ==============================================================================
// MEI-MCP — Pipeline Investigation Agent
// ==============================================================================
// Orchestrates the end-to-end pipeline failure investigation workflow.
// Deterministic orchestration: sequential evidence collection → correlation → RCA.
// Each step runs independently; failures are isolated.
// ==============================================================================

import type {
  InvestigationResult,
  PipelineInvestigationInput,
  KnowledgeMatch,
} from './types.js';
import type { PipelineConnector, SearchConnector, MonitorConnector } from '../connectors/types.js';
import { EvidenceCollector } from '../rca/evidenceCollector.js';
import { RcaEngine } from '../rca/rcaEngine.js';

interface PipelineAgentDeps {
  pipelineConnector: PipelineConnector;
  monitorConnector: MonitorConnector;
  searchConnector: SearchConnector;
}

/**
 * Pipeline Investigation Agent.
 *
 * Orchestrates the full investigation workflow:
 * 1. Retrieve pipeline run status
 * 2. Retrieve and parse build logs
 * 3. Extract failure signature (exit codes, error patterns)
 * 4. Query Azure Monitor for correlated telemetry
 * 5. Search engineering knowledge (Wiki, docs)
 * 6. Run RCA engine for root cause + confidence
 */
export class PipelineInvestigationAgent {
  private readonly evidenceCollector: EvidenceCollector;
  private readonly rcaEngine: RcaEngine;

  constructor(private readonly deps: PipelineAgentDeps) {
    this.evidenceCollector = new EvidenceCollector(deps);
    this.rcaEngine = new RcaEngine();
  }

  /**
   * Run a full pipeline failure investigation.
   * Returns partial results even if some evidence sources fail.
   */
  async investigate(
    input: PipelineInvestigationInput
  ): Promise<InvestigationResult> {
    const startTime = Date.now();
    const { organization, project, runId, lookbackHours, userContext } = input;

    // ── Step 1: Get pipeline run status ─────────────────────────────────
    let status = 'unknown';
    try {
      const run = await this.deps.pipelineConnector.getRun(
        organization,
        project,
        runId,
        userContext
      );
      status = run.result ?? run.status;
    } catch {
      status = 'error_retrieving_status';
    }

    // ── Step 2: Extract failure keywords from logs ──────────────────────
    const failureKeywords = await this.extractFailureKeywords(
      organization,
      project,
      runId,
      input
    );

    // ── Step 3: Collect all evidence concurrently ───────────────────────
    const evidence = await this.evidenceCollector.collectPipelineEvidence({
      organization,
      project,
      runId,
      lookbackHours,
      userContext,
      failureKeywords,
    });

    // ── Step 4: Search knowledge base ──────────────────────────────────
    const knowledgeMatches = await this.searchKnowledge(
      failureKeywords,
      userContext
    );

    // ── Step 5: Run RCA ────────────────────────────────────────────────
    const rcaResult = this.rcaEngine.analyze(evidence, knowledgeMatches);

    const durationMs = Date.now() - startTime;

    return {
      status,
      rootCause: rcaResult.rootCause,
      confidence: rcaResult.confidence,
      failureSignature: rcaResult.failureSignature,
      evidence: rcaResult.evidence,
      relatedChanges: rcaResult.relatedChanges,
      knowledgeMatches: rcaResult.knowledgeMatches,
      recommendedActions: rcaResult.recommendedActions,
      durationMs,
    };
  }

  /**
   * Extract failure keywords from pipeline logs for knowledge search.
   */
  private async extractFailureKeywords(
    organization: string,
    project: string,
    runId: number,
    input: PipelineInvestigationInput
  ): Promise<string[]> {
    try {
      const logs = await this.deps.pipelineConnector.getLogs(
        organization,
        project,
        runId,
        input.userContext
      );

      const keywords = new Set<string>();

      for (const log of logs) {
        if (log.result !== 'failed') continue;

        const lines = log.content.split('\n');
        for (const line of lines) {
          const lower = line.toLowerCase();

          // Extract common error patterns
          if (lower.includes('oomkilled') || lower.includes('oom')) {
            keywords.add('OOMKilled');
          }
          if (lower.includes('exit code 137')) {
            keywords.add('exit code 137');
            keywords.add('memory');
          }
          if (lower.includes('exit code 1')) {
            keywords.add('build failure');
          }
          if (lower.includes('imagepullbackoff')) {
            keywords.add('ImagePullBackOff');
          }
          if (lower.includes('crashloopbackoff')) {
            keywords.add('CrashLoopBackOff');
          }
          if (lower.includes('timeout') || lower.includes('timed out')) {
            keywords.add('timeout');
          }
          if (
            lower.includes('permission denied') ||
            lower.includes('access denied')
          ) {
            keywords.add('permission denied');
          }

          // Extract error message patterns (e.g., "Error: XYZ")
          const errorMatch = line.match(/(?:error|exception|fatal):\s*(.{10,80})/i);
          if (errorMatch?.[1]) {
            keywords.add(errorMatch[1].trim());
          }
        }
      }

      return Array.from(keywords).slice(0, 10); // Limit keywords
    } catch {
      return [];
    }
  }

  /**
   * Search the engineering knowledge base for relevant documents.
   */
  private async searchKnowledge(
    keywords: string[],
    userContext: PipelineInvestigationInput['userContext']
  ): Promise<KnowledgeMatch[]> {
    if (keywords.length === 0) return [];

    try {
      const query = keywords.join(' ');
      const results = await this.deps.searchConnector.search(
        query,
        { maxResults: 3, useSemanticRanking: true },
        userContext
      );

      return results.map((r) => ({
        title: r.document.title,
        source: r.document.sourceType,
        url: r.document.sourceUrl,
        relevantSection:
          r.highlights?.[0] ?? r.document.content.slice(0, 200),
        relevanceScore: r.score,
      }));
    } catch {
      return [];
    }
  }
}
