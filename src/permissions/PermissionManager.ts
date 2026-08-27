import * as vscode from 'vscode'; import * as fs from 'node:fs/promises'; import * as path from 'node:path'; import { AgentTool } from '../agent/types'; import { safePath } from '../tools/utils';
export class PermissionManager {
  constructor(private readonly root: string, private readonly settings: () => { reads: boolean; writes: boolean; terminal: boolean; tools: boolean; fileOperations: boolean; autoApproveAll: boolean }) {}
  async approve(tool: AgentTool, args: unknown): Promise<boolean> {
    const s = this.settings(); if (!tool.requiresApproval) return s.reads;
    const input = args as any; const command = String(input?.command || '');
    const dangerous = tool.name === 'run_terminal' && /(^|\s)(rm\s+-rf|sudo|git\s+reset\s+--hard|git\s+push|chmod\s+-R)(\s|$)|curl\s+[^\n|]*\|\s*(sh|bash)/i.test(command);
    if (s.autoApproveAll && !dangerous) return true;
    if (tool.name === 'write_file') {
      try { const file = safePath(this.root, String(input?.path)); const current = await fs.readFile(file, 'utf8').catch(() => ''); const proposed = await vscode.workspace.openTextDocument({ content: String(input?.content || ''), language: path.extname(file).slice(1) }); const original = await vscode.workspace.openTextDocument(vscode.Uri.file(file)); await vscode.commands.executeCommand('vscode.diff', original.uri, proposed.uri, `Local Agent: ${path.relative(this.root, file)}`); if (current === String(input?.content || '')) return true; } catch { /* approval prompt remains the fallback */ }
    }
    if (tool.name.startsWith('mcp__') && s.tools) return true;
    if (!dangerous && tool.name === 'write_file' && s.fileOperations) return true;
    if (!dangerous && tool.name === 'run_terminal' && s.terminal) return true;
    const label = tool.name === 'run_terminal' ? `Run command: ${command}` : `Apply write to ${input?.path}`;
    return (await vscode.window.showWarningMessage(`Local Agent approval required: ${label}`, { modal: true }, 'Allow')) === 'Allow';
  }
}
