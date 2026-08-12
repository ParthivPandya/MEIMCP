// ==============================================================================
// MEI-MCP — Azure DevOps Connector
// ==============================================================================
// Implements PipelineConnector using Azure DevOps REST API.
// Automatic retry with exponential backoff for transient failures.
// Input sanitization — all user inputs validated before API calls.
// ==============================================================================

import { ConnectorError } from '../errors/index.js';
import { getConfig, isServiceConfigured } from '../config/configuration.js';
import type {
  PipelineConnector,
  PipelineRun,
  PipelineLog,
  PipelineTimeline,
  CommitInfo,
  WorkItem,
} from './types.js';
import type { UserContext } from '../auth/types.js';

// Simple in-memory cache to prevent rate-limiting for rapid GET requests
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const responseCache = new Map<string, { data: any, timestamp: number }>();

function getCached<T>(key: string): T | null {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: any): void {
  responseCache.set(key, { data, timestamp: Date.now() });
}

const ADO_API_VERSION = '7.1';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Azure DevOps REST API connector.
 * Uses PAT or OBO token for authentication.
 */
export class AzureDevOpsConnector implements PipelineConnector {
  private getBaseUrl(organization: string): string {
    const safeOrg = encodeURIComponent(organization);
    return `https://dev.azure.com/${safeOrg}`;
  }

  private async makeRequest<T>(
    url: string,
    _context: UserContext,
    method: string = 'GET',
    body?: unknown
  ): Promise<T> {
    const config = getConfig();

    if (!isServiceConfigured('ado')) {
      throw new ConnectorError(
        'Azure DevOps is not configured. Set ADO_ORGANIZATION and ADO_PAT.',
        'AzureDevOps'
      );
    }

    const token = config.ado.pat!;
    const authHeader = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await this.delay(delayMs);
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'Unknown error');
          throw new ConnectorError(
            `Azure DevOps API returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
            'AzureDevOps',
            url
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof ConnectorError) throw error;

        // Retry on network errors
        if (attempt < MAX_RETRIES - 1) {
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw new ConnectorError(
      `Azure DevOps API request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? 'Unknown error'}`,
      'AzureDevOps',
      url
    );
  }

  async getRun(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<PipelineRun> {
    const cacheKey = `ado_run_${organization}_${project}_${runId}`;
    const cached = getCached<PipelineRun>(cacheKey);
    if (cached) {
      return cached;
    }

    const safeProject = encodeURIComponent(project);
    const url = `${this.getBaseUrl(organization)}/${safeProject}/_apis/build/builds/${runId}?api-version=${ADO_API_VERSION}`;

    const data = await this.makeRequest<Record<string, unknown>>(url, context);

    const result: PipelineRun = {
      id: data['id'] as number,
      name: (data['definition'] as Record<string, unknown>)?.['name'] as string ?? 'Unknown',
      status: this.mapBuildStatus(data['status'] as string),
      result: this.mapBuildResult(data['result'] as string | undefined),
      startTime: data['startTime'] as string | undefined,
      finishTime: data['finishTime'] as string | undefined,
      sourceBranch: data['sourceBranch'] as string | undefined,
      sourceVersion: data['sourceVersion'] as string | undefined,
      requestedBy: (data['requestedBy'] as Record<string, unknown>)?.['displayName'] as string | undefined,
      url: (data['_links'] as Record<string, Record<string, string>>)?.['web']?.['href'],
    };

    setCache(cacheKey, result);
    return result;
  }

  async getLogs(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<PipelineLog[]> {
    const safeProject = encodeURIComponent(project);

    // First get the timeline to know which steps had logs
    const timelineUrl = `${this.getBaseUrl(organization)}/${safeProject}/_apis/build/builds/${runId}/timeline?api-version=${ADO_API_VERSION}`;
    const timeline = await this.makeRequest<{ records: Record<string, unknown>[] }>(
      timelineUrl,
      context
    );

    const logs: PipelineLog[] = [];
    const failedRecords = timeline.records.filter(
      (r) => r['result'] === 'failed' || r['result'] === 'abandoned'
    );

    // Get logs for failed steps (or all steps if none failed)
    const targetRecords = failedRecords.length > 0 ? failedRecords : timeline.records.slice(0, 10);

    for (const record of targetRecords) {
      const logId = (record['log'] as Record<string, unknown>)?.['id'] as number | undefined;
      if (!logId) continue;

      try {
        const logUrl = `${this.getBaseUrl(organization)}/${safeProject}/_apis/build/builds/${runId}/logs/${logId}?api-version=${ADO_API_VERSION}`;
        const logContent = await this.makeRequest<{ value: string[] }>(logUrl, context);

        logs.push({
          taskName: record['name'] as string ?? 'Unknown',
          stepId: record['order'] as number ?? 0,
          content: Array.isArray(logContent.value)
            ? logContent.value.join('\n')
            : String(logContent),
          timestamp: record['startTime'] as string | undefined,
          result: this.mapTaskResult(record['result'] as string | undefined),
        });
      } catch {
        // Continue collecting other logs if one fails
        logs.push({
          taskName: record['name'] as string ?? 'Unknown',
          stepId: record['order'] as number ?? 0,
          content: '[Log retrieval failed]',
          result: this.mapTaskResult(record['result'] as string | undefined),
        });
      }
    }

    return logs;
  }

  async getTimeline(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<PipelineTimeline[]> {
    const safeProject = encodeURIComponent(project);
    const url = `${this.getBaseUrl(organization)}/${safeProject}/_apis/build/builds/${runId}/timeline?api-version=${ADO_API_VERSION}`;

    const data = await this.makeRequest<{ records: Record<string, unknown>[] }>(
      url,
      context
    );

    return data.records
      .filter((r) => r['type'] === 'Task')
      .map((r) => ({
        taskName: r['name'] as string ?? 'Unknown',
        status: r['state'] as string ?? 'unknown',
        result: r['result'] as string | undefined,
        startTime: r['startTime'] as string | undefined,
        finishTime: r['finishTime'] as string | undefined,
        errorCount: r['errorCount'] as number | undefined,
        warningCount: r['warningCount'] as number | undefined,
      }));
  }

  async getRecentCommits(
    organization: string,
    project: string,
    repositoryId: string,
    count: number,
    context: UserContext
  ): Promise<CommitInfo[]> {
    const safeProject = encodeURIComponent(project);
    const safeRepo = encodeURIComponent(repositoryId);
    const safeCount = Math.min(Math.max(1, count), 50);
    const url = `${this.getBaseUrl(organization)}/${safeProject}/_apis/git/repositories/${safeRepo}/commits?$top=${safeCount}&api-version=${ADO_API_VERSION}`;

    const data = await this.makeRequest<{ value: Record<string, unknown>[] }>(
      url,
      context
    );

    return data.value.map((c) => ({
      commitId: c['commitId'] as string,
      message: c['comment'] as string ?? '',
      author: (c['author'] as Record<string, unknown>)?.['name'] as string ?? 'Unknown',
      timestamp: (c['author'] as Record<string, unknown>)?.['date'] as string ?? '',
    }));
  }

  async createBug(
    organization: string,
    project: string,
    title: string,
    description: string,
    severity: string,
    areaPath?: string,
    assignedTo?: string,
    context?: UserContext
  ): Promise<WorkItem> {
    const safeProject = encodeURIComponent(project);
    const url = `${this.getBaseUrl(organization)}/${safeProject}/_apis/wit/workitems/$Bug?api-version=${ADO_API_VERSION}`;

    const patchDoc: { op: string; path: string; value: string }[] = [
      { op: 'add', path: '/fields/System.Title', value: title },
      { op: 'add', path: '/fields/System.Description', value: description },
      {
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Severity',
        value: severity,
      },
    ];

    if (areaPath) {
      patchDoc.push({
        op: 'add',
        path: '/fields/System.AreaPath',
        value: areaPath,
      });
    }

    if (assignedTo) {
      patchDoc.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: assignedTo,
      });
    }

    const config = getConfig();
    const token = config.ado.pat!;
    const authHeader = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json-patch+json',
        Accept: 'application/json',
      },
      body: JSON.stringify(patchDoc),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ConnectorError(
        `Failed to create bug: HTTP ${response.status} — ${errorBody.slice(0, 200)}`,
        'AzureDevOps',
        url,
        context?.correlationId
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const fields = data['fields'] as Record<string, unknown>;

    return {
      id: data['id'] as number,
      type: 'Bug',
      title: fields['System.Title'] as string,
      state: fields['System.State'] as string,
      assignedTo: (fields['System.AssignedTo'] as Record<string, unknown>)?.['displayName'] as string | undefined,
      url: (data['_links'] as Record<string, Record<string, string>>)?.['html']?.['href'],
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private mapBuildStatus(
    status: string
  ): PipelineRun['status'] {
    const map: Record<string, PipelineRun['status']> = {
      completed: 'completed',
      inProgress: 'inProgress',
      cancelling: 'cancelling',
      notStarted: 'notStarted',
    };
    return map[status] ?? 'notStarted';
  }

  private mapBuildResult(
    result: string | undefined
  ): PipelineRun['result'] | undefined {
    if (!result) return undefined;
    const map: Record<string, PipelineRun['result']> = {
      succeeded: 'succeeded',
      failed: 'failed',
      canceled: 'canceled',
      partiallySucceeded: 'partiallySucceeded',
    };
    return map[result];
  }

  private mapTaskResult(
    result: string | undefined
  ): PipelineLog['result'] | undefined {
    if (!result) return undefined;
    const map: Record<string, PipelineLog['result']> = {
      succeeded: 'succeeded',
      failed: 'failed',
      skipped: 'skipped',
    };
    return map[result];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
