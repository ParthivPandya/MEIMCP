// ==============================================================================
// MEI-MCP — RAG Search Engine
// ==============================================================================

import type { SearchConnector, SearchResult, SearchOptions } from '../connectors/types.js';
import type { UserContext } from '../auth/types.js';

/**
 * Knowledge Search Engine wrapping the search connector with
 * security scoping and result formatting.
 */
export class KnowledgeSearchEngine {
  constructor(private readonly searchConnector: SearchConnector) {}

  /**
   * Search engineering knowledge with security-scoped filtering.
   */
  async search(
    query: string,
    options: {
      sources?: string[];
      maxResults?: number;
    },
    context: UserContext
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      maxResults: options.maxResults ?? 5,
      sourceTypes: options.sources,
      useSemanticRanking: true,
      useVector: true,
    };

    return this.searchConnector.search(query, searchOptions, context);
  }
}
