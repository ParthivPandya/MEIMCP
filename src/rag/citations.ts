// ==============================================================================
// MEI-MCP — Citation Formatting
// ==============================================================================

import type { SearchResult } from '../connectors/types.js';

export interface Citation {
  title: string;
  source: string;
  url: string;
  relevantSection: string;
  relevanceScore: number;
}

/**
 * Format search results into structured citations for MCP tool responses.
 */
export function formatCitations(results: SearchResult[]): Citation[] {
  return results.map((r) => ({
    title: r.document.title,
    source: r.document.sourceType,
    url: r.document.sourceUrl,
    relevantSection:
      r.highlights?.[0] ?? r.document.content.slice(0, 300),
    relevanceScore: Math.round(r.score * 100) / 100,
  }));
}

/**
 * Format citations as a readable markdown string.
 */
export function citationsToMarkdown(citations: Citation[]): string {
  if (citations.length === 0) return 'No matching knowledge found.';

  return citations
    .map(
      (c, i) =>
        `${i + 1}. **${c.title}** (${c.source}, score: ${c.relevanceScore})\n   ${c.relevantSection}\n   [Source](${c.url})`
    )
    .join('\n\n');
}
