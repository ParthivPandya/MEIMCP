// ==============================================================================
// MEI-MCP — Embeddings Client
// ==============================================================================

import { getConfig, isServiceConfigured } from '../config/configuration.js';
import { ConnectorError } from '../errors/index.js';

/**
 * Azure OpenAI embedding client wrapper.
 */
export class EmbeddingsClient {
  private readonly cache = new Map<string, number[]>();

  /**
   * Generate embeddings for a text string.
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = text.slice(0, 100); // Simple cache key
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!isServiceConfigured('openai')) {
      // Return zero vector as fallback in development
      return new Array(1536).fill(0) as number[];
    }

    const config = getConfig();
    const url = `${config.openai.endpoint}/openai/deployments/${config.openai.embeddingDeployment}/embeddings?api-version=${config.openai.apiVersion}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.openai.apiKey!,
        },
        body: JSON.stringify({ input: text }),
      });

      if (!response.ok) {
        throw new ConnectorError(
          `Embedding generation failed: HTTP ${response.status}`,
          'AzureOpenAI'
        );
      }

      const data = (await response.json()) as {
        data: { embedding: number[] }[];
      };
      const embedding = data.data[0]?.embedding ?? [];

      // Cache with size limit
      if (this.cache.size > 1000) {
        const firstKey = this.cache.keys().next().value as string;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        `Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown'}`,
        'AzureOpenAI'
      );
    }
  }

  /**
   * Generate embeddings for multiple texts in batch.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process sequentially to respect rate limits
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
