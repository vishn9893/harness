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
import { ChatRequest } from './llm/types';
import { restoreLatestSnapshot } from './tools/SnapshotManager';

export function activate(context: vscode.ExtensionContext) {
  let session = newSession();
  let panel: ChatPanel | undefined;
  let activeAgent: Agent | undefined;
  let sessionAutoApproveTools = Boolean(session.autoApproveTools);
  let lightMode = Boolean(vscode.workspace.getConfiguration('localAgent').get('lightMode', false));
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const getConfig = () => vscode.workspace.getConfiguration('localAgent');
  const sessionKey = 'localAgent.sessions';
  const savedSessions = () => context.globalState.get<AgentSession[]>(sessionKey, []);
  const sessionTitle = (value: AgentSession) => value.title || (value.messages.find(message => message.role === 'user')?.content || 'Untitled session').split(/\r?\n/)[0].slice(0, 72);
  const persistSession = async (value = session) => { const sessions = savedSessions().filter(item => item.id !== value.id); await context.globalState.update(sessionKey, [value, ...sessions].slice(0, 50)); };
  const generateTitle = async (client: OpenAICompatibleClient, value: AgentSession) => {
    const summary = value.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => `${message.role}: ${message.content || ''}`).join('\n').slice(0, 5000);
    const request: ChatRequest = { model: getConfig().get('model', 'LFM2.5-2.6B-Q4_K_M'), temperature: 0.2, stream: false, tool_choice: 'none', messages: [{ role: 'system', content: 'Create a concise title for this coding session. Reply with only 3 to 7 words, no quotes, markdown, or punctuation.' }, { role: 'user', content: summary }] };
    try { const response = await client.chat(request); const title = (response.choices?.[0]?.message?.content || '').replace(/["\n#*_`]/g, '').trim().slice(0, 72); if (title) value.title = title; } catch { /* title generation must never block a completed session */ }
  };

  const start = async (text: string) => {
    if (!root) return Promise.reject(new Error('Open a workspace before using Local Agent.'));
    const c = getConfig();
    const registry = new ToolRegistry()
      .register(readFileTool(root)).register(writeFileTool(root, c.get('enableSnapshots', false))).register(searchTool(root))
      .register(listFilesTool(root)).register(terminalTool(root, c.get<number>('requestTimeout', 120000))).register(gitDiffTool(root));
    const mcp = await connectMcpTools(c.get<McpServer[]>('mcpServers', []), registry);
    for (const error of mcp.errors) panel?.add({ type: 'error', text: `MCP server unavailable: ${error}` });
    const permissions = new PermissionManager(root, () => ({
      reads: c.get('autoApproveReads', true), writes: c.get('autoApproveWrites', false), terminal: c.get('autoApproveTerminal', false),
      tools: c.get('autoApproveTools', false), fileOperations: c.get('autoApproveFileOperations', c.get('autoApproveWrites', false)), autoApproveAll: sessionAutoApproveTools
    }));
    const client = new OpenAICompatibleClient(c.get('endpoint', 'http://127.0.0.1:8082/v1'), c.get('apiKey', 'local'), c.get('requestTimeout', 120000));
    const agent = new Agent(
      client,
      registry,
      { model: c.get('model', 'LFM2.5-2.6B-Q4_K_M'), temperature: c.get('temperature', 0.2), maxIterations: c.get('maxIterations', 30), contextWindow: c.get('contextWindow', 32768), autoCompactionLimit: c.get<number | null>('autoCompactionLimit', 80), pruneOldOutputs: c.get('pruneOldOutputs', false), approve: (tool, args) => permissions.approve(tool, args) },
      event => panel?.add(event)
    );
    activeAgent = agent;
    const extraContext = `${attachedFilesContext(session.contextFiles)}\n${configuredContext(root, c.get<string[]>('skillFiles', []), c.get<McpServer[]>('mcpServers', []))}`;
    return (async () => { const answer = await agent.run(session, `${workspaceContext()}\n\nUser request:\n${text}`, extraContext); if (!session.title && session.messages.some(message => message.role === 'assistant')) await generateTitle(client, session); panel?.metrics(session.stats); return answer; })().finally(async () => { await closeMcpTools(mcp.connections); await persistSession(); if (activeAgent === agent) activeAgent = undefined; });
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
    const url = await vscode.window.showInputBox({ prompt: 'Remote MCP URL (leave blank for local stdio)' });
    let server: McpServer;
    if (url) {
      const selectedTransport = await vscode.window.showQuickPick(['streamable-http', 'sse'], { placeHolder: 'Remote MCP transport' }); if (!selectedTransport) return;
      const transport = selectedTransport as 'streamable-http' | 'sse';
      const apiKey = await vscode.window.showInputBox({ prompt: 'Bearer token (optional)', password: true });
      server = { name, url, transport, apiKey: apiKey || undefined };
    } else {
      const command = await vscode.window.showInputBox({ prompt: 'MCP server command', value: 'npx' }); if (!command) return;
      const argsText = await vscode.window.showInputBox({ prompt: 'Arguments, space-separated (optional)' });
      server = { name, command, args: argsText ? argsText.split(/\s+/) : [] };
    }
    const c = getConfig(); const servers = c.get<McpServer[]>('mcpServers', []);
    await c.update('mcpServers', [...servers.filter(item => item.name !== name), server], vscode.ConfigurationTarget.Workspace);
    panel?.add({ type: 'status', text: `MCP server registered: ${name}` });
  };

  const showHistory = () => { panel?.history(savedSessions().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt).map(item => ({ id: item.id, title: sessionTitle(item), updatedAt: item.updatedAt, pinned: Boolean(item.pinned) }))); };
  const loadSession = (id: string) => { activeAgent?.stop(); const found = savedSessions().find(item => item.id === id); if (!found) return; session = { ...found, messages: [...found.messages], contextFiles: found.contextFiles || [] }; sessionAutoApproveTools = Boolean(session.autoApproveTools); panel?.restore(session.messages); panel?.setAutoApprove(sessionAutoApproveTools); panel?.add({ type: 'status', text: `loaded session: ${sessionTitle(session)}` }); };
  const togglePin = async (id: string) => { const found = savedSessions().find(item => item.id === id); if (!found) return; found.pinned = !found.pinned; await context.globalState.update(sessionKey, savedSessions().map(item => item.id === id ? found : item)); showHistory(); };
  const deleteSession = async (id: string) => { const found = savedSessions().find(item => item.id === id); if (!found) return; const choice = await vscode.window.showWarningMessage(`Delete session “${sessionTitle(found)}”?`, { modal: true }, 'Delete'); if (choice !== 'Delete') return; await context.globalState.update(sessionKey, savedSessions().filter(item => item.id !== id)); if (session.id === id) { activeAgent?.stop(); session = newSession(); sessionAutoApproveTools = false; panel?.clear(); } showHistory(); };
  const createNewSession = async () => { activeAgent?.stop(); await persistSession(); session = newSession(); sessionAutoApproveTools = false; panel?.clear(); };
  const resetSession = async () => { activeAgent?.stop(); clearSession(session); sessionAutoApproveTools = false; session.autoApproveTools = false; await persistSession(); panel?.clear(); };
  const toggleAutoApprove = () => { sessionAutoApproveTools = !sessionAutoApproveTools; session.autoApproveTools = sessionAutoApproveTools; panel?.setAutoApprove(sessionAutoApproveTools); panel?.add({ type: 'status', text: sessionAutoApproveTools ? 'auto-approve enabled for this session' : 'auto-approve disabled for this session' }); };
  const toggleLightMode = async () => { lightMode = !lightMode; await getConfig().update('lightMode', lightMode, vscode.ConfigurationTarget.Workspace); panel?.setLightMode(lightMode); };
  const open = () => {
    panel = ChatPanel.show(context, async text => { try { await start(text); } catch (e) { panel?.add({ type: 'error', text: e instanceof Error ? e.message : String(e) }); } },
      { newSession: createNewSession, clearSession: resetSession, stop: () => activeAgent?.stop(), addFiles, addSkill, addMcp, history: showHistory, loadSession, deleteSession, togglePin, toggleAutoApprove, toggleLightMode });
    panel.metrics(session.stats);
    panel.setAutoApprove(sessionAutoApproveTools);
    panel.setLightMode(lightMode);
  };

  context.subscriptions.push(vscode.commands.registerCommand('localAgent.openChat', open));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.newSession', createNewSession));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.clearSession', resetSession));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.stopSession', () => activeAgent?.stop()));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.addFilesToContext', addFiles));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.addSkill', addSkill));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.addMcpServer', addMcp));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.showHistory', showHistory));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.restoreLastSnapshot', async () => {
    if (!root) return;
    const choice = await vscode.window.showWarningMessage('Restore the most recent Local Agent snapshot?', { modal: true }, 'Restore');
    if (choice !== 'Restore') return;
    try { const id = await restoreLatestSnapshot(root); vscode.window.showInformationMessage(`Restored snapshot ${id}.`); } catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('localAgent.configureModel', async () => {
    const c = getConfig(); const value = await vscode.window.showInputBox({ prompt: 'OpenAI-compatible endpoint', value: c.get('endpoint', 'http://127.0.0.1:8082/v1') });
    if (value) await c.update('endpoint', value, vscode.ConfigurationTarget.Workspace);
  }));
}

export function deactivate() {}
