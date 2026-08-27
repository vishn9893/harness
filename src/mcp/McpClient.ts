import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { AgentTool } from '../agent/types';
import { McpServer } from '../agent/types';
import { ToolRegistry } from '../tools/ToolRegistry';

type Transport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;
interface ConnectedServer { client: Client; transport: Transport; }

function toolName(server: string, tool: string): string { const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_'); return `mcp__${clean(server)}__${clean(tool)}`; }
function outputOf(value: unknown): string { const result = value as { content?: Array<{ type: string; text?: string }>; isError?: boolean }; const text = (result.content || []).map(item => item.type === 'text' ? item.text || '' : `[${item.type} content]`).join('\n'); return result.isError ? `MCP tool failed: ${text}` : text || '(MCP tool returned no text output)'; }
function headers(server: McpServer): Record<string, string> { return { ...(server.headers || {}), ...(server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : {}) }; }

function createTransport(server: McpServer): Transport {
  if (server.url) {
    const requestInit = { headers: headers(server) };
    if (server.transport === 'sse') return new SSEClientTransport(new URL(server.url), { requestInit });
    return new StreamableHTTPClientTransport(new URL(server.url), { requestInit });
  }
  if (!server.command) throw new Error('MCP server requires either url or command');
  return new StdioClientTransport({ command: server.command, args: server.args || [], cwd: server.cwd, env: { ...getDefaultEnvironment(), ...(server.env || {}) }, stderr: 'inherit' });
}

export async function connectMcpTools(servers: McpServer[], registry: ToolRegistry): Promise<{ connections: ConnectedServer[]; errors: string[] }> {
  const connections: ConnectedServer[] = []; const errors: string[] = [];
  for (const server of servers) {
    let client: Client | undefined; let transport: Transport | undefined;
    try {
      transport = createTransport(server); client = new Client({ name: 'local-agent', version: '0.2.1' }); const connectedClient = client;
      await connectedClient.connect(transport); const listed = await connectedClient.listTools();
      for (const discovered of listed.tools) {
        const name = toolName(server.name, discovered.name);
        const tool: AgentTool = { name, description: `[MCP ${server.name}] ${discovered.description || discovered.name}`, schema: discovered.inputSchema, requiresApproval: true,
          async execute(args) { try { const result = await connectedClient.callTool({ name: discovered.name, arguments: (args || {}) as Record<string, unknown> }); return { ok: !result.isError, output: outputOf(result) }; } catch (error) { return { ok: false, output: `MCP tool ${discovered.name} failed: ${error instanceof Error ? error.message : String(error)}` }; } } };
        registry.register(tool);
      }
      connections.push({ client: connectedClient, transport });
    } catch (error) {
      errors.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
      try { await client?.close(); } catch { /* connection may not have initialized */ }
      try { await transport?.close(); } catch { /* transport may not have started */ }
    }
  }
  return { connections, errors };
}
export async function closeMcpTools(connections: ConnectedServer[]): Promise<void> { await Promise.all(connections.map(async ({ client, transport }) => { try { await client.close(); } catch {} try { await transport.close(); } catch {} })); }
