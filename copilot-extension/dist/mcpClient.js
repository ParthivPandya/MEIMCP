import { Client, SSEClientTransport } from '@modelcontextprotocol/client';
import { EventSource } from 'eventsource';
// Ensure the Node environment uses our EventSource polyfill if needed for the SDK
global.EventSource = EventSource;
export class McpClientWrapper {
    serverUrl;
    client;
    transport = null;
    isConnected = false;
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.client = new Client({ name: 'copilot-extension', version: '1.0.0' }, { capabilities: {} });
    }
    async connect(authHeader) {
        if (this.isConnected)
            return;
        const url = new URL(this.serverUrl);
        // Add auth headers if propagating the user's token
        const headers = {};
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }
        this.transport = new SSEClientTransport(url, {
            eventSourceInit: { headers },
            requestInit: { headers }
        });
        await this.client.connect(this.transport);
        this.isConnected = true;
        console.log(`Connected to MCP Server at ${this.serverUrl}`);
    }
    async listTools() {
        return this.client.listTools();
    }
    async callTool(name, args) {
        return this.client.callTool({ name, arguments: args });
    }
    async close() {
        if (this.transport) {
            await this.transport.close();
            this.isConnected = false;
        }
    }
}
