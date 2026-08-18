import { Message, ToolCall } from '../llm/types';
export interface AgentEvent { type: 'assistant' | 'tool_call' | 'tool_result' | 'approval' | 'error' | 'status'; text?: string; tool?: string; args?: unknown; callId?: string; requiresApproval?: boolean; }
export interface AgentTool { name: string; description: string; schema: object; requiresApproval: boolean; execute(args: unknown, signal?: AbortSignal): Promise<ToolResult>; }
export interface ToolResult { ok: boolean; output: string; }
export type EventHandler = (event: AgentEvent) => void;
export interface AgentOptions { model: string; temperature: number; maxIterations: number; approve: (tool: AgentTool, args: unknown) => Promise<boolean>; }
export interface ContextFile { path: string; content: string; }
export interface AgentSession { id: string; messages: Message[]; contextFiles: ContextFile[]; createdAt: number; updatedAt: number; }
