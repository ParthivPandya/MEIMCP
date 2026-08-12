// ==============================================================================
// MEI-MCP — Azure AI Search Connector (RAG)
// ==============================================================================
// Hybrid search: keyword (BM25) + vector + semantic ranking.
// Security-filtered results using securityScope metadata.
// ==============================================================================

import { ConnectorError } from '../errors/index.js';
import { getConfig, isServiceConfigured } from '../config/configuration.js';
import type {
  SearchConnector,
  SearchDocument,
  SearchResult,
  SearchOptions,
} from './types.js';
import type { UserContext } from '../auth/types.js';

const DEFAULT_MAX_RESULTS = 5;

/**
 * Azure AI Search connector implementing hybrid retrieval.
 * Falls back to in-memory mock search when AI Search is not configured.
 */
export class AzureAISearchConnector implements SearchConnector {
  /** In-memory document store for development/testing. */
  private mockDocuments: SearchDocument[] = [];

  async search(
    query: string,
    options: SearchOptions,
    context: UserContext
  ): Promise<SearchResult[]> {
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

    // If AI Search is configured, use it
    if (isServiceConfigured('aiSearch')) {
      return this.searchAzure(query, options, context);
    }

    // Fallback: in-memory search for development
    return this.searchInMemory(query, maxResults, options.sourceTypes, context);
  }

  async indexDocument(document: SearchDocument): Promise<void> {
    if (isServiceConfigured('aiSearch')) {
      await this.indexAzure(document);
      return;
    }

    // Fallback: store in memory
    const existingIndex = this.mockDocuments.findIndex(
      (d) => d.id === document.id
    );
    if (existingIndex >= 0) {
      this.mockDocuments[existingIndex] = document;
    } else {
      this.mockDocuments.push(document);
    }
  }

  /**
   * Load sample documents for development/testing.
   */
  loadSampleDocuments(documents: SearchDocument[]): void {
    this.mockDocuments = [...documents];
  }

  // ── Azure AI Search Implementation ─────────────────────────────────────

  private async searchAzure(
    query: string,
    options: SearchOptions,
    context: UserContext
  ): Promise<SearchResult[]> {
    const config = getConfig();
    const endpoint = config.aiSearch.endpoint!;
    const apiKey = config.aiSearch.apiKey!;
    const indexName = config.aiSearch.indexName;

    const url = `${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=2024-07-01`;

    // Build filter for security scoping
    const filters: string[] = [];
    if (options.securityScope) {
      filters.push(`securityScope eq '${options.securityScope.replace(/'/g, "''")}'`);
    }
    if (options.sourceTypes && options.sourceTypes.length > 0) {
      const sourceFilter = options.sourceTypes
        .map((s) => `sourceType eq '${s.replace(/'/g, "''")}'`)
        .join(' or ');
      filters.push(`(${sourceFilter})`);
    }

    const searchBody: Record<string, unknown> = {
      search: query,
      top: options.maxResults ?? DEFAULT_MAX_RESULTS,
      queryType: options.useSemanticRanking ? 'semantic' : 'simple',
      searchMode: 'all',
    };

    if (filters.length > 0) {
      searchBody['filter'] = filters.join(' and ');
    }

    if (options.useSemanticRanking) {
      searchBody['semanticConfiguration'] = 'default';
    }

    // Add highlight fields
    searchBody['highlight'] = 'content';
    searchBody['highlightPreTag'] = '<<<';
    searchBody['highlightPostTag'] = '>>>';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new ConnectorError(
          `AI Search query failed: HTTP ${response.status} — ${errorBody.slice(0, 200)}`,
          'AzureAISearch',
          url,
          context.correlationId
        );
      }

      const data = (await response.json()) as {
        value: (SearchDocument & {
          '@search.score': number;
          '@search.highlights'?: { content?: string[] };
        })[];
      };

      return data.value.map((doc) => ({
        document: {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          sourceType: doc.sourceType,
          sourceUrl: doc.sourceUrl,
          project: doc.project,
          team: doc.team,
          environment: doc.environment,
          securityScope: doc.securityScope,
          lastUpdated: doc.lastUpdated,
          contentHash: doc.contentHash,
        },
        score: doc['@search.score'],
        highlights: doc['@search.highlights']?.content,
      }));
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        `AI Search query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AzureAISearch',
        undefined,
        context.correlationId
      );
    }
  }

  private async indexAzure(document: SearchDocument): Promise<void> {
    const config = getConfig();
    const endpoint = config.aiSearch.endpoint!;
    const apiKey = config.aiSearch.apiKey!;
    const indexName = config.aiSearch.indexName;

    const url = `${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/index?api-version=2024-07-01`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        value: [
          {
            '@search.action': 'mergeOrUpload',
            ...document,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new ConnectorError(
        `Failed to index document: HTTP ${response.status}`,
        'AzureAISearch'
      );
    }
  }

  // ── In-Memory Fallback ─────────────────────────────────────────────────

  private searchInMemory(
    query: string,
    maxResults: number,
    sourceTypes?: string[],
    _context?: UserContext
  ): SearchResult[] {
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/);

    let candidates = this.mockDocuments;

    // Filter by source type
    if (sourceTypes && sourceTypes.length > 0) {
      candidates = candidates.filter((d) =>
        sourceTypes.includes(d.sourceType)
      );
    }

    // Score by term frequency
    const scored = candidates
      .map((doc) => {
        const text = `${doc.title} ${doc.content}`.toLowerCase();
        let score = 0;

        for (const term of terms) {
          const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const matches = text.match(regex);
          score += matches ? matches.length : 0;
        }

        // Title match bonus
        const titleLower = doc.title.toLowerCase();
        for (const term of terms) {
          if (titleLower.includes(term)) {
            score += 3;
          }
        }

        return { document: doc, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    // Normalize scores to 0-1
    const maxScore = scored[0]?.score ?? 1;
    return scored.map((r) => ({
      document: r.document,
      score: r.score / maxScore,
      highlights: this.extractHighlights(r.document.content, terms),
    }));
  }

  private extractHighlights(
    content: string,
    terms: string[]
  ): string[] {
    const sentences = content.split(/[.!?\n]+/).filter(Boolean);
    const highlights: string[] = [];

    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      if (terms.some((t) => sentenceLower.includes(t))) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }
}
