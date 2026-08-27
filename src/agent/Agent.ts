import { OpenAICompatibleClient } from '../llm/OpenAICompatibleClient';
import { ChatRequest, Message } from '../llm/types';
import { AgentEvent, AgentOptions, EventHandler, AgentSession } from './types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { append } from './Session';

const SYSTEM = 'You are a careful coding agent in a VS Code workspace. Inspect before modifying, prefer small changes, use tools instead of guessing, run relevant tests, and explain failures. Never access outside the workspace or claim a change succeeded unless a tool confirms it.';
export class Agent {
  private controller?: AbortController;
  constructor(private readonly client: OpenAICompatibleClient, private readonly registry: ToolRegistry, private readonly options: AgentOptions, private readonly onEvent: EventHandler = () => {}) {}
  stop(): void { this.controller?.abort(); }
  async run(session: AgentSession, userText: string, context = ''): Promise<string> {
    if (this.controller) throw new Error('An agent run is already active.');
    this.controller = new AbortController();
    const signal = this.controller.signal;
    append(session, { role: 'user', content: userText });
    this.onEvent({ type: 'status', text: 'running' });
    try { for (let iteration = 0; iteration < this.options.maxIterations; iteration++) {
      if (signal.aborted) return this.stopped();
      const request: ChatRequest = { model: this.options.model, temperature: this.options.temperature, stream: false,
        messages: [{ role: 'system', content: `${SYSTEM}${context ? `\n\nAdditional context:\n${context}` : ''}` }, ...session.messages], tools: this.registry.definitions(), tool_choice: 'auto' };
      let message: Message;
      try {
        const started = Date.now(); const response = await this.client.chat(request, signal); const elapsedMs = Math.max(1, Date.now() - started);
        const inputTokens = response.usage?.prompt_tokens || 0; const outputTokens = response.usage?.completion_tokens || 0;
        session.stats = session.stats || { inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
        session.stats.inputTokens += inputTokens; session.stats.outputTokens += outputTokens; session.stats.elapsedMs += elapsedMs;
        this.onEvent({ type: 'metrics', inputTokens, outputTokens, tokensPerSecond: outputTokens / (elapsedMs / 1000) });
        message = response.choices![0].message!;
      } catch (e) { if (signal.aborted) return this.stopped(); this.onEvent({ type: 'error', text: e instanceof Error ? e.message : String(e) }); throw e; }
      append(session, message);
      if (!message.tool_calls?.length) { const answer = message.content || ''; this.onEvent({ type: 'assistant', text: answer }); return answer; }
      for (const call of message.tool_calls) {
        let args: unknown;
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = null; }
        const tool = this.registry.get(call.function.name);
        this.onEvent({ type: 'tool_call', tool: call.function.name, args, callId: call.id, requiresApproval: !!tool?.requiresApproval });
        let output: string;
        if (!tool) output = `Unsupported tool: ${call.function.name}`;
        else if (args === null) output = 'Invalid JSON tool arguments';
        else if (tool.requiresApproval && !(await this.options.approve(tool, args))) output = 'Permission denied by user.';
        else { const result = await tool.execute(args, signal); output = result.output; }
        this.onEvent({ type: 'tool_result', tool: call.function.name, text: output, callId: call.id });
        append(session, { role: 'tool', tool_call_id: call.id, name: call.function.name, content: output });
      }
    }
    const message = `Stopped after reaching the maximum of ${this.options.maxIterations} iterations.`;
    this.onEvent({ type: 'error', text: message }); return message;
    } finally { this.controller = undefined; }
  }
  private stopped(): string { const message = 'Session stopped by user.'; this.onEvent({ type: 'status', text: 'stopped' }); return message; }
}
