import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Agent } from './agent/Agent';
import { attachedFilesContext, configuredContext, workspaceContext } from './agent/ContextManager';
import { AgentSession, ContextFile } from './agent/types';
import { newSession, clearSession } from './agent/Session';
import { OpenAICompatibleClient } from './llm/OpenAICompatibleClient';
import { ToolRegistry } from './tools/ToolRegistry';
import { readFileTool } from './tools/ReadFileTool';
import { writeFileTool } from './tools/WriteFileTool';
import { listFilesTool } from './tools/ListFilesTool';
import { searchTool } from './tools/SearchTool';
import { terminalTool } from './tools/TerminalTool';
import { gitDiffTool } from './tools/GitDiffTool';
import { PermissionManager } from './permissions/PermissionManager';
import { ChatPanel } from './ui/ChatPanel';
import { closeMcpTools, connectMcpTools } from './mcp/McpClient';
import { McpServer } from './agent/types';

export function activate(context: vscode.ExtensionContext) {
  let session = newSession();
  let panel: ChatPanel | undefined;
  let activeAgent: Agent | undefined;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const getConfig = () => vscode.workspace.getConfiguration('localAgent');
  const sessionKey = 'localAgent.sessions';
  const savedSessions = () => context.globalState.get<AgentSession[]>(sessionKey, []);
  const sessionTitle = (value: AgentSession) => (value.messages.find(message => message.role === 'user')?.content || 'Untitled session').split(/\r?\n/)[0].slice(0, 72);
  const persistSession = async (value = session) => { const sessions = savedSessions().filter(item => item.id !== value.id); await context.globalState.update(sessionKey, [value, ...sessions].slice(0, 50)); };

  const start = async (text: string) => {
    if (!root) return Promise.reject(new Error('Open a workspace before using Local Agent.'));
    const c = getConfig();
    const registry = new ToolRegistry()
      .register(readFileTool(root)).register(writeFileTool(root)).register(searchTool(root))
      .register(listFilesTool(root)).register(terminalTool(root, c.get<number>('requestTimeout', 120000))).register(gitDiffTool(root));
    const mcp = await connectMcpTools(c.get<McpServer[]>('mcpServers', []), registry);
    for (const error of mcp.errors) panel?.add({ type: 'error', text: `MCP server unavailable: ${error}` });
    const permissions = new PermissionManager(root, () => ({
      reads: c.get('autoApproveReads', true), writes: c.get('autoApproveWrites', false), terminal: c.get('autoApproveTerminal', false)
    }));
    const agent = new Agent(
      new OpenAICompatibleClient(c.get('endpoint', 'http://localhost:8080/v1'), c.get('apiKey', 'local'), c.get('requestTimeout', 120000)),
      registry,
      { model: c.get('model', 'local-model'), temperature: c.get('temperature', 0.2), maxIterations: c.get('maxIterations', 30), approve: (tool, args) => permissions.approve(tool, args) },
      event => panel?.add(event)
    );
    activeAgent = agent;
    const extraContext = `${attachedFilesContext(session.contextFiles)}\n${configuredContext(root, c.get<string[]>('skillFiles', []), c.get<McpServer[]>('mcpServers', []))}`;
    return agent.run(session, `${workspaceContext()}\n\nUser request:\n${text}`, extraContext).finally(async () => { await closeMcpTools(mcp.connections); await persistSession(); if (activeAgent === agent) activeAgent = undefined; });
  };

  const addFiles = async () => {
    if (!root) return;
    const picks = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Add to context', defaultUri: vscode.Uri.file(root), filters: { 'Source and text files': ['ts', 'js', 'tsx', 'jsx', 'json', 'md', 'py', 'java', 'go', 'rs', 'txt', 'yaml', 'yml'] } });
    if (!picks) return;
    const files: ContextFile[] = [];
    for (const uri of picks) {
      const resolved = path.resolve(uri.fsPath);
      if (resolved !== root && !resolved.startsWith(`${path.resolve(root)}${path.sep}`)) continue;
      try { files.push({ path: vscode.workspace.asRelativePath(uri), content: await fs.readFile(uri.fsPath, 'utf8') }); } catch { /* ignore unreadable files */ }
    }
    session.contextFiles = [...session.contextFiles.filter(old => !files.some(file => file.path === old.path)), ...files];
    panel?.add({ type: 'status', text: `${files.length} file(s) attached to context` });
  };

  const addSkill = async () => {
    if (!root) return;
    const picks = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Add skill', defaultUri: vscode.Uri.file(root), filters: { 'Markdown skills': ['md'] } });
    if (!picks?.[0]) return;
    const relative = vscode.workspace.asRelativePath(picks[0]);
    const c = getConfig(); const skills = c.get<string[]>('skillFiles', []);
    if (!skills.includes(relative)) await c.update('skillFiles', [...skills, relative], vscode.ConfigurationTarget.Workspace);
    panel?.add({ type: 'status', text: `Skill added: ${relative}` });
  };

  const addMcp = async () => {
    const name = await vscode.window.showInputBox({ prompt: 'MCP server name' }); if (!name) return;
    const command = await vscode.window.showInputBox({ prompt: 'MCP server command (not started automatically)', value: 'npx' }); if (!command) return;
    const argsText = await vscode.window.showInputBox({ prompt: 'Arguments, space-separated (optional)' });
    const c = getConfig(); const servers = c.get<McpServer[]>('mcpServers', []);
    await c.update('mcpServers', [...servers.filter(server => server.name !== name), { name, command, args: argsText ? argsText.split(/\s+/) : [] }], vscode.ConfigurationTarget.Workspace);
    panel?.add({ type: 'status', text: `MCP server registered: ${name}` });
  };

  const showHistory = () => { panel?.history(savedSessions().map(item => ({ id: item.id, title: sessionTitle(item), updatedAt: item.updatedAt }))); };
  const loadSession = (id: string) => { activeAgent?.stop(); const found = savedSessions().find(item => item.id === id); if (!found) return; session = { ...found, messages: [...found.messages], contextFiles: found.contextFiles || [] }; panel?.restore(session.messages); panel?.add({ type: 'status', text: `loaded session: ${sessionTitle(session)}` }); };
  const createNewSession = async () => { activeAgent?.stop(); await persistSession(); session = newSession(); panel?.clear(); };
  const resetSession = async () => { activeAgent?.stop(); clearSession(session); await persistSession(); panel?.clear(); };
  const open = () => {
    panel = ChatPanel.show(context, async text => { try { await start(text); } catch (e) { panel?.add({ type: 'error', text: e instanceof Error ? e.message : String(e) }); } },
      { newSession: createNewSession, clearSession: resetSession, stop: () => activeAgent?.stop(), addFiles, addSkill, addMcp, history: showHistory, loadSession });
  };

  context.subscriptions.push(vscode.commands.registerCommand('localAgent.openChat', open));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.newSession', createNewSession));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.clearSession', resetSession));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.stopSession', () => activeAgent?.stop()));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.addFilesToContext', addFiles));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.addSkill', addSkill));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.addMcpServer', addMcp));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.showHistory', showHistory));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.configureModel', async () => {
    const c = getConfig(); const value = await vscode.window.showInputBox({ prompt: 'OpenAI-compatible endpoint', value: c.get('endpoint', 'http://localhost:8080/v1') });
    if (value) await c.update('endpoint', value, vscode.ConfigurationTarget.Workspace);
  }));
}

export function deactivate() {}
