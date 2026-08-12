// ==============================================================================
// MEI-MCP — Evidence Collector
// ==============================================================================
// Collects evidence from multiple sources concurrently.
// Uses Promise.allSettled so one failing source doesn't crash the investigation.
// ==============================================================================

import type { Evidence } from '../agents/types.js';
import type { UserContext } from '../auth/types.js';
import type { PipelineConnector, MonitorConnector, SearchConnector } from '../connectors/types.js';
import { AzureMonitorConnector } from '../connectors/azureMonitor.js';

interface EvidenceCollectorDeps {
  pipelineConnector: PipelineConnector;
  monitorConnector: MonitorConnector;
  searchConnector: SearchConnector;
}

interface CollectionParams {
  organization: string;
  project: string;
  runId: number;
  lookbackHours: number;
  userContext: UserContext;
  /** Failure keywords extracted from logs for knowledge search. */
  failureKeywords?: string[];
}

/**
 * Collects evidence from all available sources concurrently.
 * Each source is independent — failures are captured, not propagated.
 */
export class EvidenceCollector {
  constructor(private readonly deps: EvidenceCollectorDeps) {}

  /**
   * Collect all available evidence for a pipeline failure investigation.
   */
  async collectPipelineEvidence(
    params: CollectionParams
  ): Promise<Evidence[]> {
    const { organization, project, runId, lookbackHours, userContext } = params;

    // Run all evidence collection concurrently
    const results = await Promise.allSettled([
      this.collectPipelineLogs(organization, project, runId, userContext),
      this.collectPipelineTimeline(organization, project, runId, userContext),
      this.collectMonitorEvidence(project, lookbackHours, userContext),
      this.collectKnowledgeEvidence(
        params.failureKeywords ?? [],
        userContext
      ),
    ]);

    // Flatten all successful results
    const evidence: Evidence[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        evidence.push(...result.value);
      }
      // Failed sources are silently skipped — partial results are still useful
    }

    return evidence;
  }

  /**
   * Collect evidence from pipeline build logs.
   */
  private async collectPipelineLogs(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<Evidence[]> {
    const logs = await this.deps.pipelineConnector.getLogs(
      organization,
      project,
      runId,
      context
    );

    const evidence: Evidence[] = [];

    for (const log of logs) {
      if (log.result === 'failed') {
        // Extract key error lines
        const errorLines = log.content
          .split('\n')
          .filter(
            (line) =>
              line.toLowerCase().includes('error') ||
              line.toLowerCase().includes('exception') ||
              line.toLowerCase().includes('fatal') ||
              line.toLowerCase().includes('exit code') ||
              line.toLowerCase().includes('oom')
          )
          .slice(0, 10);

        if (errorLines.length > 0) {
          evidence.push({
            source: 'AzureDevOps',
            timestamp: log.timestamp ?? new Date().toISOString(),
            type: 'log',
            signal: `Failed task: ${log.taskName}`,
            value: errorLines.join('\n'),
            relevance: 0.9,
          });
        }
      }
    }

    return evidence;
  }

  /**
   * Collect evidence from pipeline timeline (task statuses).
   */
  private async collectPipelineTimeline(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<Evidence[]> {
    const timeline = await this.deps.pipelineConnector.getTimeline(
      organization,
      project,
      runId,
      context
    );

    const evidence: Evidence[] = [];

    // Find failed tasks
    const failedTasks = timeline.filter(
      (t) => t.result === 'failed' || t.result === 'abandoned'
    );

    for (const task of failedTasks) {
      evidence.push({
        source: 'AzureDevOps',
        timestamp: task.finishTime ?? task.startTime ?? new Date().toISOString(),
        type: 'event',
        signal: `Task failed: ${task.taskName}`,
        value: `Status: ${task.status}, Result: ${task.result ?? 'unknown'}, Errors: ${task.errorCount ?? 0}`,
        relevance: 0.85,
      });
    }

    return evidence;
  }

  /**
   * Collect evidence from Azure Monitor (logs and metrics).
   */
  private async collectMonitorEvidence(
    serviceName: string,
    lookbackHours: number,
    context: UserContext
  ): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    try {
      const query = AzureMonitorConnector.buildPipelineFailureQuery(
        serviceName,
        lookbackHours
      );

      const result = await this.deps.monitorConnector.queryLogs(
        '', // Workspace ID comes from config
        query,
        `PT${lookbackHours}H`,
        context
      );

      if (result.tables.length > 0) {
        const firstTable = result.tables[0];
        if (firstTable && firstTable.rows.length > 0) {
          const summary = firstTable.rows
            .slice(0, 5)
            .map((row) => String(row[2] ?? ''))
            .join('\n');

          evidence.push({
            source: 'AzureMonitor',
            timestamp: new Date().toISOString(),
            type: 'log',
            signal: 'Container log errors',
            value: summary,
            relevance: 0.8,
          });
        }
      }
    } catch {
      // Monitor might not be configured — skip silently
    }

    return evidence;
  }

  /**
   * Collect evidence from the engineering knowledge base.
   */
  private async collectKnowledgeEvidence(
    keywords: string[],
    context: UserContext
  ): Promise<Evidence[]> {
    if (keywords.length === 0) return [];

    const evidence: Evidence[] = [];
    const query = keywords.join(' ');

    try {
      const results = await this.deps.searchConnector.search(
        query,
        { maxResults: 3, useSemanticRanking: true },
        context
      );

      for (const result of results) {
        evidence.push({
          source: 'AzureAISearch',
          timestamp: result.document.lastUpdated,
          type: 'document',
          signal: result.document.title,
          value:
            result.highlights?.[0] ??
            result.document.content.slice(0, 200),
          relevance: result.score * 0.8, // Scale down document relevance
          url: result.document.sourceUrl,
        });
      }
    } catch {
      // Knowledge search might not be configured — skip silently
    }

    return evidence;
  }
}
