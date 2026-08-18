import { ChatRequest, ChatResponse } from './types';

export class OpenAICompatibleClient {
  constructor(private readonly endpoint: string, private readonly apiKey: string, private readonly timeoutMs = 120000) {}

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const base = this.endpoint.replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
      const response = await fetch(`${base}/chat/completions`, { method: 'POST', signal: combined,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify(request) });
      const body = await response.json() as ChatResponse;
      if (!response.ok) throw new Error(body.error?.message || `Model request failed (${response.status})`);
      if (!body.choices?.[0]?.message) throw new Error('Model returned no assistant message');
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`Model request timed out after ${this.timeoutMs}ms`);
      throw new Error(`Unable to reach model endpoint: ${error instanceof Error ? error.message : String(error)}`);
    } finally { clearTimeout(timeout); }
  }
}
