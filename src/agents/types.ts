// ==============================================================================
// MEI-MCP — Agent & Evidence Types
// ==============================================================================

/**
 * A single piece of evidence collected during investigation.
 */
export interface Evidence {
  /** Source system that provided this evidence. */
  source: 'AzureDevOps' | 'AzureMonitor' | 'AzureAISearch' | 'AKS' | 'AppInsights' | 'Wiki' | 'SharePoint' | 'IncidentHistory';
  /** When the evidence was observed. */
  timestamp: string;
  /** Category of evidence. */
  type: 'log' | 'metric' | 'event' | 'deployment' | 'commit' | 'document' | 'incident';
  /** What signal this evidence represents. */
  signal: string;
  /** The observed value. */
  value: string;
  /** How relevant this evidence is to the investigation (0.0–1.0). */
  relevance: number;
  /** Optional URL to the evidence source. */
  url?: string;
}

/**
 * Known failure signatures used by the RCA engine.
 */
export interface FailureSignature {
  /** Pattern identifier. */
  pattern: string;
  /** Exit code associated with this failure. */
  exitCode?: number;
  /** Keywords that match this failure. */
  keywords: string[];
  /** Human-readable category. */
  category: string;
  /** Typical root cause description. */
  typicalCause: string;
  /** Recommended actions. */
  recommendedActions: string[];
}

/**
 * Result of a root cause analysis.
 */
export interface RcaResult {
  /** Most likely root cause description. */
  rootCause: string;
  /** Confidence score (0.0–1.0). */
  confidence: number;
  /** Failure signature pattern that matched. */
  failureSignature: string;
  /** All evidence collected during investigation. */
  evidence: Evidence[];
  /** Related source code changes. */
  relatedChanges: RelatedChange[];
  /** Matching knowledge base documents. */
  knowledgeMatches: KnowledgeMatch[];
  /** Recommended remediation actions. */
  recommendedActions: string[];
}

/**
 * A source code change correlated with the failure.
 */
export interface RelatedChange {
  commitId: string;
  message: string;
  author: string;
  timestamp: string;
  relevance: number;
}

/**
 * A matching document from the knowledge base.
 */
export interface KnowledgeMatch {
  title: string;
  source: string;
  url: string;
  relevantSection: string;
  relevanceScore: number;
}

/**
 * Full investigation result returned by pipeline agent.
 */
export interface InvestigationResult {
  /** Pipeline status. */
  status: string;
  /** Root cause analysis. */
  rootCause: string;
  /** Confidence score. */
  confidence: number;
  /** Failure signature identifier. */
  failureSignature: string;
  /** Evidence items. */
  evidence: Evidence[];
  /** Related changes. */
  relatedChanges: RelatedChange[];
  /** Knowledge matches. */
  knowledgeMatches: KnowledgeMatch[];
  /** Recommended actions. */
  recommendedActions: string[];
  /** Investigation duration in ms. */
  durationMs: number;
}

/**
 * Input parameters for a pipeline investigation.
 */
export interface PipelineInvestigationInput {
  organization: string;
  project: string;
  runId: number;
  lookbackHours: number;
  userContext: import('../auth/types.js').UserContext;
}
