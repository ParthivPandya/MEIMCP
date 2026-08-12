// ==============================================================================
// MEI-MCP — SharePoint Ingestion Pipeline
// ==============================================================================

import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import { generateEmbeddings } from '../rag/embeddings.js';
import { uploadDocuments } from '../rag/search.js';
import { getConfig } from '../config/configuration.js';

export class SharePointIngestionPipeline {
  private graphClient: Client | null = null;

  constructor() {
    const config = getConfig();
    
    // In production, initialize graphClient using @azure/identity (e.g. DefaultAzureCredential)
    // and a custom AuthProvider for MS Graph.
    if (config.authBypassEnabled) {
      console.warn('Running SharePoint Ingestion in Auth Bypass Mode - Graph calls will be mocked.');
    }
  }

  async runIngestion(siteId: string): Promise<number> {
    console.log(`Starting SharePoint ingestion for site: ${siteId}`);
    
    let indexedCount = 0;

    // 1. Fetch documents
    const docs = await this.fetchDocuments(siteId);

    // 2. Chunk and embed
    for (const doc of docs) {
      const chunks = doc.text.split('\n\n').filter(c => c.trim().length > 20);
      const searchDocuments = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i]!;
        const embedding = await generateEmbeddings(chunkText);
        
        searchDocuments.push({
          id: Buffer.from(`${doc.id}-${i}`).toString('base64url'),
          title: doc.name,
          content: chunkText,
          url: doc.webUrl,
          sourceType: 'sharepoint',
          project: 'enterprise-knowledge',
          vector: embedding,
        });
      }

      // 3. Upload to Azure AI Search
      if (searchDocuments.length > 0) {
        await uploadDocuments(searchDocuments);
        indexedCount += searchDocuments.length;
      }
    }

    console.log(`Successfully ingested ${indexedCount} chunks from SharePoint.`);
    return indexedCount;
  }

  private async fetchDocuments(siteId: string): Promise<{id: string, name: string, text: string, webUrl: string}[]> {
    if (!this.graphClient) {
      // Mock for MVP when Auth Bypass is enabled
      return [
        {
          id: 'doc1',
          name: 'Incident Response Policy.docx',
          text: 'All severity 1 incidents must be acknowledged within 15 minutes. The incident commander is responsible for creating a war room in Microsoft Teams.',
          webUrl: `https://company.sharepoint.com/sites/${siteId}/doc1`
        }
      ];
    }

    // Production implementation:
    // const drive = await this.graphClient.api(`/sites/${siteId}/drive`).get();
    // const items = await this.graphClient.api(`/drives/${drive.id}/root/children`).get();
    // (Followed by downloading content and parsing docx/pdf via respective libraries)
    throw new Error('Graph client not initialized with valid credentials.');
  }
}
