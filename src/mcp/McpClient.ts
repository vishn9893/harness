import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AgentTool } from '../agent/types';
import { ToolRegistry } from '../tools/ToolRegistry';

type McpServer = { name: string; command: string; args?: string[]; env?: Record<string, string>; cwd?: string };

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport;
}

function toolName(server: string, tool: string): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `mcp__${clean(server)}__${clean(tool)}`;
}

function outputOf(value: unknown): string {
  const result = value as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  const content = result.content || [];
  const text = content.map(item => item.type === 'text' ? item.text || '' : `[${item.type} content]`).join('\n');
  return result.isError ? `MCP tool failed: ${text}` : text || '(MCP tool returned no text output)';
}

export async function connectMcpTools(servers: McpServer[], registry: ToolRegistry): Promise<{ connections: ConnectedServer[]; errors: string[] }> {
  const connections: ConnectedServer[] = [];
  const errors: string[] = [];
  for (const server of servers) {
    let client: Client | undefined;
    let transport: StdioClientTransport | undefined;
    try {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        cwd: server.cwd,
        env: { ...getDefaultEnvironment(), ...(server.env || {}) },
        stderr: 'inherit'
      });
      client = new Client({ name: 'local-agent', version: '0.2.0' });
      const connectedClient = client;
      await connectedClient.connect(transport);
      const listed = await connectedClient.listTools();
      for (const discovered of listed.tools) {
        const name = toolName(server.name, discovered.name);
        const tool: AgentTool = {
          name,
          description: `[MCP ${server.name}] ${discovered.description || discovered.name}`,
          schema: discovered.inputSchema,
          requiresApproval: true,
          async execute(args) {
            try {
              const result = await connectedClient.callTool({ name: discovered.name, arguments: (args || {}) as Record<string, unknown> });
              return { ok: !result.isError, output: outputOf(result) };
            } catch (error) {
              return { ok: false, output: `MCP tool ${discovered.name} failed: ${error instanceof Error ? error.message : String(error)}` };
            }
          }
        };
        registry.register(tool);
      }
      connections.push({ client: connectedClient, transport });
    } catch (error) {
      errors.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
      try { await client?.close(); } catch { /* connection may not have initialized */ }
      try { await transport?.close(); } catch { /* process may not have started */ }
    }
  }
  return { connections, errors };
}

export async function closeMcpTools(connections: ConnectedServer[]): Promise<void> {
  await Promise.all(connections.map(async ({ client, transport }) => {
    try { await client.close(); } catch { /* server may already have exited */ }
    try { await transport.close(); } catch { /* transport may already be closed */ }
  }));
}