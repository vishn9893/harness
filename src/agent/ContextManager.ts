import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { safePath } from '../tools/utils';
import { ContextFile } from './types';
import { bounded } from '../tools/utils';
import { McpServer } from './types';
export function workspaceContext(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'No workspace open';
  const editor = vscode.window.activeTextEditor;
  const current = editor ? `${vscode.workspace.asRelativePath(editor.document.uri)} (lines ${editor.selection.start.line + 1}-${editor.selection.end.line + 1})` : 'none';
  const open = vscode.window.visibleTextEditors.map(e => vscode.workspace.asRelativePath(e.document.uri)).slice(0, 20);
  return `Workspace root: ${root}\nCurrent file: ${current}\nOpen files: ${open.join(', ') || 'none'}`;
}
export function attachedFilesContext(files: ContextFile[]): string { return files.length ? files.map(file => `--- ${file.path} ---\n${bounded(file.content, 30000)}`).join('\n\n') : ''; }
export function configuredContext(root: string, skillFiles: string[], mcpServers: McpServer[]): string {
  const skills = skillFiles.map(file => { try { return `--- skill: ${file} ---\n${bounded(fs.readFileSync(safePath(root, file), 'utf8'), 20000)}`; } catch { return `--- skill: ${file} (unavailable) ---`; } }).join('\n\n');
  const mcp = mcpServers.length ? `Configured MCP servers:\n${mcpServers.map(server => `- ${server.name}`).join('\n')}` : '';
  return [skills, mcp].filter(Boolean).join('\n\n');
}
