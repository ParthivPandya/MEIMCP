// ==============================================================================
// MEI-MCP — Azure DevOps Wiki Ingestion Pipeline
// ==============================================================================

import { getConfig } from '../config/configuration.js';
import { generateEmbeddings } from '../rag/embeddings.js';
import { uploadDocuments } from '../rag/search.js';
// In a full implementation, we would use azure-devops-node-api
// For MVP, we simulate the ingestion pipeline fetching from ADO Wiki

export interface WikiPage {
  path: string;
  content: string;
  url: string;
}

export class AdoWikiIngestionPipeline {
  private organization: string;
  private project: string;

  constructor(organization: string, project: string) {
    this.organization = organization;
    this.project = project;
  }

  async runIngestion(): Promise<number> {
    console.log(`Starting ADO Wiki ingestion for ${this.organization}/${this.project}`);
    
    // 1. Fetch wiki pages (Mocked for MVP)
    const pages = await this.fetchWikiPages();

    let indexedCount = 0;

    // 2. Chunk and embed
    for (const page of pages) {
      // Very naive chunking by paragraphs for demonstration
      const chunks = page.content.split('\n\n').filter(c => c.trim().length > 20);
      
      const searchDocuments = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i]!;
        const embedding = await generateEmbeddings(chunkText);
        
        searchDocuments.push({
          id: Buffer.from(`${page.path}-${i}`).toString('base64url'), // Safe Search ID
          title: page.path.split('/').pop() || page.path,
          content: chunkText,
          url: `${page.url}#chunk-${i}`,
          sourceType: 'ado_wiki',
          project: this.project,
          vector: embedding,
        });
      }

      // 3. Upload to Azure AI Search
      if (searchDocuments.length > 0) {
        await uploadDocuments(searchDocuments);
        indexedCount += searchDocuments.length;
      }
    }

    console.log(`Successfully ingested ${indexedCount} chunks from ADO Wiki.`);
    return indexedCount;
  }

  private async fetchWikiPages(): Promise<WikiPage[]> {
    // In production, use standard ADO REST API: GET https://dev.azure.com/{org}/{project}/_apis/wiki/wikis/{wikiIdentifier}/pages
    return [
      {
        path: '/Runbooks/OOMKilled',
        content: '# OOMKilled Runbook\n\nIf a pod is OOMKilled with exit code 137, immediately check the container memory limits. We recommend increasing the limit by 256Mi and checking for memory leaks in the Java heap.',
        url: `https://dev.azure.com/${this.organization}/${this.project}/_wiki/wikis/wiki1/1/OOMKilled`
      },
      {
        path: '/Architecture/PaymentService',
        content: '# Payment Service\n\nThe payment service relies on Azure Service Bus for message processing. If messages are dead-lettering, check the downstream dependency on the external banking API.',
        url: `https://dev.azure.com/${this.organization}/${this.project}/_wiki/wikis/wiki1/2/PaymentService`
      }
    ];
  }
}
