// ==============================================================================
// MEI-MCP — Connector Interface Types
// ==============================================================================
// Abstract interfaces for all downstream connectors.
// Agents and tools depend on these interfaces, not concrete implementations.
// ==============================================================================

import type { UserContext } from '../auth/types.js';

// ── Pipeline / Azure DevOps ──────────────────────────────────────────────────

export interface PipelineRun {
  id: number;
  name: string;
  status: 'completed' | 'failed' | 'inProgress' | 'cancelling' | 'notStarted';
  result?: 'succeeded' | 'failed' | 'canceled' | 'partiallySucceeded';
  startTime?: string;
  finishTime?: string;
  sourceBranch?: string;
  sourceVersion?: string;
  requestedBy?: string;
  url?: string;
}

export interface PipelineLog {
  taskName: string;
  stepId: number;
  content: string;
  timestamp?: string;
  result?: 'succeeded' | 'failed' | 'skipped';
}

export interface PipelineTimeline {
  taskName: string;
  status: string;
  result?: string;
  startTime?: string;
  finishTime?: string;
  errorCount?: number;
  warningCount?: number;
  log?: string;
}

export interface CommitInfo {
  commitId: string;
  message: string;
  author: string;
  timestamp: string;
  changes?: string[];
}

export interface WorkItem {
  id: number;
  type: string;
  title: string;
  state: string;
  assignedTo?: string;
  url?: string;
}

export interface PipelineConnector {
  getRun(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<PipelineRun>;

  getLogs(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<PipelineLog[]>;

  getTimeline(
    organization: string,
    project: string,
    runId: number,
    context: UserContext
  ): Promise<PipelineTimeline[]>;

  getRecentCommits(
    organization: string,
    project: string,
    repositoryId: string,
    count: number,
    context: UserContext
  ): Promise<CommitInfo[]>;

  createBug(
    organization: string,
    project: string,
    title: string,
    description: string,
    severity: string,
    areaPath?: string,
    assignedTo?: string,
    context?: UserContext
  ): Promise<WorkItem>;
}

// ── Azure Monitor / Log Analytics ────────────────────────────────────────────

export interface LogQueryResult {
  tables: LogQueryTable[];
  statistics?: Record<string, unknown>;
}

export interface LogQueryTable {
  name: string;
  columns: { name: string; type: string }[];
  rows: unknown[][];
}

export interface MetricResult {
  name: string;
  unit: string;
  timeseries: {
    timestamp: string;
    average?: number;
    maximum?: number;
    minimum?: number;
    total?: number;
    count?: number;
  }[];
}

export interface MonitorConnector {
  queryLogs(
    workspaceId: string,
    query: string,
    timespan: string,
    context: UserContext
  ): Promise<LogQueryResult>;

  queryMetrics(
    resourceId: string,
    metricNames: string[],
    timespan: string,
    context: UserContext
  ): Promise<MetricResult[]>;
}

// ── Azure AI Search (RAG) ────────────────────────────────────────────────────

export interface SearchDocument {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  sourceUrl: string;
  project?: string;
  team?: string;
  environment?: string;
  securityScope?: string;
  lastUpdated: string;
  contentHash?: string;
}

export interface SearchResult {
  document: SearchDocument;
  score: number;
  highlights?: string[];
}

export interface SearchConnector {
  search(
    query: string,
    options: SearchOptions,
    context: UserContext
  ): Promise<SearchResult[]>;

  indexDocument(document: SearchDocument): Promise<void>;
}

export interface SearchOptions {
  maxResults?: number;
  sourceTypes?: string[];
  securityScope?: string;
  useVector?: boolean;
  useSemanticRanking?: boolean;
}

// ── Deployment ───────────────────────────────────────────────────────────────

export interface DeploymentInfo {
  id: string;
  environment: string;
  service: string;
  status: string;
  startTime: string;
  finishTime?: string;
  requestedBy?: string;
  sourceVersion?: string;
  changes?: CommitInfo[];
  configChanges?: ConfigChange[];
}

export interface ConfigChange {
  file: string;
  property: string;
  previousValue: string;
  newValue: string;
}
