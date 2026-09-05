import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
export function configuredContext(root: string | undefined, skillFiles: string[], globalSkillDirectories: string[], mcpServers: McpServer[]): string {
  const workspaceSkills = root ? skillFiles.map(file => {
    try { return { label: file, path: safePath(root, file) }; } catch { return { label: file, path: '' }; }
  }) : [];
  const globalSkills = globalSkillDirectories.flatMap(directory => {
    const result: { label: string; path: string }[] = [];
    const visit = (current: string) => {
      try {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const entryPath = path.join(current, entry.name);
          if (entry.isDirectory()) visit(entryPath);
          else if (entry.isFile() && entry.name === 'SKILL.md') result.push({ label: entryPath, path: entryPath });
        }
      } catch { /* unavailable directories are reported below */ }
    };
    visit(directory);
    return result.length ? result : [{ label: directory, path: '' }];
  });
  const skills = [...workspaceSkills, ...globalSkills].map(skill => {
    try { return `--- skill: ${skill.label} ---\n${bounded(fs.readFileSync(skill.path, 'utf8'), 20000)}`; }
    catch { return `--- skill: ${skill.label} (unavailable) ---`; }
  }).join('\n\n');
  const mcp = mcpServers.length ? `Configured MCP servers:\n${mcpServers.map(server => `- ${server.name}`).join('\n')}` : '';
  return [skills, mcp].filter(Boolean).join('\n\n');
}

export function projectMemoryContext(memory: string): string {
  return memory.trim() ? `Project memory (durable facts from earlier completed turns):\n${memory.trim()}` : '';
}
