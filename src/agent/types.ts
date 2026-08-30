import { Message, ToolCall } from '../llm/types';
export interface AgentEvent { type: 'assistant' | 'tool_call' | 'tool_result' | 'approval' | 'error' | 'status' | 'metrics'; text?: string; tool?: string; args?: unknown; callId?: string; requiresApproval?: boolean; inputTokens?: number; outputTokens?: number; tokensPerSecond?: number; }
export interface AgentTool { name: string; description: string; schema: object; requiresApproval: boolean; execute(args: unknown, signal?: AbortSignal): Promise<ToolResult>; }
export interface ToolResult { ok: boolean; output: string; }
export type EventHandler = (event: AgentEvent) => void;
export interface AgentOptions { model: string; temperature: number; maxIterations: number; approve: (tool: AgentTool, args: unknown) => Promise<boolean>; contextWindow?: number; autoCompactionLimit?: number | null; pruneOldOutputs?: boolean; }
export interface ContextFile { path: string; content: string; }
export interface SessionStats { inputTokens: number; outputTokens: number; elapsedMs: number; }
export interface AgentSession { id: string; title?: string; messages: Message[]; contextFiles: ContextFile[]; stats?: SessionStats; pinned?: boolean; autoApproveTools?: boolean; createdAt: number; updatedAt: number; }
export interface McpServer { name: string; command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; url?: string; transport?: 'stdio' | 'streamable-http' | 'sse'; headers?: Record<string, string>; apiKey?: string; }
