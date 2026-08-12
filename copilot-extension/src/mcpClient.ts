import { Client, SSEClientTransport } from '@modelcontextprotocol/client';
import { EventSource } from 'eventsource';

// Ensure the Node environment uses our EventSource polyfill if needed for the SDK
(global as any).EventSource = EventSource;

export class McpClientWrapper {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private isConnected = false;

  constructor(private readonly serverUrl: string) {
    this.client = new Client({ name: 'copilot-extension', version: '1.0.0' }, { capabilities: {} });
  }

  async connect(authHeader?: string): Promise<void> {
    if (this.isConnected) return;

    const url = new URL(this.serverUrl);
    
    // Add auth headers if propagating the user's token
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    this.transport = new SSEClientTransport(url, { 
      eventSourceInit: { headers } as any,
      requestInit: { headers } as any
    });
    
    await this.client.connect(this.transport);
    this.isConnected = true;
    console.log(`Connected to MCP Server at ${this.serverUrl}`);
  }

  async listTools() {
    return this.client.listTools();
  }

  async callTool(name: string, args: Record<string, any>) {
    return this.client.callTool({ name, arguments: args });
  }

  async close() {
    if (this.transport) {
      await this.transport.close();
      this.isConnected = false;
    }
  }
}
