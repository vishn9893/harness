export type Role = 'system' | 'user' | 'assistant' | 'tool';
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }
export interface Message { role: Role; content: string | null; name?: string; tool_call_id?: string; tool_calls?: ToolCall[]; }
export interface ToolDefinition { type: 'function'; function: { name: string; description: string; parameters: object }; }
export interface ChatRequest { model: string; messages: Message[]; temperature: number; stream: boolean; tools?: ToolDefinition[]; tool_choice?: 'auto' | 'none'; }
export interface ChatResponse { choices?: Array<{ message?: Message; finish_reason?: string }>; error?: { message?: string }; }
