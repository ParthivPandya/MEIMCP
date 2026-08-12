// ==============================================================================
// MEI-MCP — RCA Confidence Scoring
// ==============================================================================
// Calculates confidence score based on evidence weight and corroboration.
// ==============================================================================

import type { Evidence } from '../agents/types.js';

/**
 * Weight multipliers for different evidence sources.
 */
const SOURCE_WEIGHTS: Record<string, number> = {
  AzureDevOps: 0.9,
  AzureMonitor: 0.85,
  AKS: 0.9,
  AppInsights: 0.85,
  AzureAISearch: 0.6,
  Wiki: 0.5,
  SharePoint: 0.5,
  IncidentHistory: 0.7,
};

/**
 * Weight multipliers for different evidence types.
 */
const TYPE_WEIGHTS: Record<string, number> = {
  event: 1.0,
  log: 0.9,
  metric: 0.85,
  deployment: 0.8,
  commit: 0.7,
  incident: 0.65,
  document: 0.5,
};

/**
 * Calculate a confidence score for a root cause hypothesis.
 *
 * Scoring algorithm:
 * 1. Base score from the primary evidence relevance
 * 2. Boost for multiple corroborating sources
 * 3. Boost for known failure pattern match
 * 4. Boost for knowledge base confirmation
 * 5. Capped at 0.99 (never 100% certain)
 *
 * @param evidence - All collected evidence items
 * @param patternMatched - Whether a known failure pattern matched
 * @param knowledgeConfirmed - Whether knowledge base confirmed the hypothesis
 * @returns Confidence score between 0.0 and 0.99
 */
export function calculateConfidence(
  evidence: Evidence[],
  patternMatched: boolean,
  knowledgeConfirmed: boolean
): number {
  if (evidence.length === 0) {
    return 0;
  }

  // 1. Base score: weighted average of evidence relevance
  let weightedSum = 0;
  let weightTotal = 0;

  for (const item of evidence) {
    const sourceWeight = SOURCE_WEIGHTS[item.source] ?? 0.5;
    const typeWeight = TYPE_WEIGHTS[item.type] ?? 0.5;
    const weight = sourceWeight * typeWeight;

    weightedSum += item.relevance * weight;
    weightTotal += weight;
  }

  let score = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // 2. Corroboration boost: multiple unique sources increase confidence
  const uniqueSources = new Set(evidence.map((e) => e.source));
  if (uniqueSources.size >= 3) {
    score *= 1.15;
  } else if (uniqueSources.size >= 2) {
    score *= 1.08;
  }

  // 3. Pattern match boost
  if (patternMatched) {
    score *= 1.1;
  }

  // 4. Knowledge base confirmation boost
  if (knowledgeConfirmed) {
    score *= 1.05;
  }

  // 5. Evidence volume factor (diminishing returns)
  const volumeFactor = Math.min(1.0, 0.7 + 0.05 * evidence.length);
  score *= volumeFactor;

  // Clamp to [0.0, 0.99]
  return Math.min(0.99, Math.max(0, Math.round(score * 100) / 100));
}

/**
 * Generate a human-readable explanation of the confidence score.
 */
export function explainConfidence(
  confidence: number,
  evidence: Evidence[],
  patternMatched: boolean,
  knowledgeConfirmed: boolean
): string {
  const parts: string[] = [];

  if (confidence >= 0.9) {
    parts.push('High confidence');
  } else if (confidence >= 0.7) {
    parts.push('Moderate-to-high confidence');
  } else if (confidence >= 0.5) {
    parts.push('Moderate confidence');
  } else {
    parts.push('Low confidence');
  }

  const uniqueSources = new Set(evidence.map((e) => e.source));
  parts.push(
    `based on ${evidence.length} evidence item(s) from ${uniqueSources.size} source(s)`
  );

  if (patternMatched) {
    parts.push('with known failure pattern match');
  }
  if (knowledgeConfirmed) {
    parts.push('confirmed by engineering knowledge base');
  }

  return parts.join(', ') + '.';
}
