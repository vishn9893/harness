import { AgentTool } from '../agent/types';
export class ToolRegistry {
  private tools = new Map<string, AgentTool>();
  register(tool: AgentTool): this { this.tools.set(tool.name, tool); return this; }
  get(name: string): AgentTool | undefined { return this.tools.get(name); }
  definitions() { return [...this.tools.values()].map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.schema } })); }
}
