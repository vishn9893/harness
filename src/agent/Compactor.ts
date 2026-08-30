import { Message } from '../llm/types';

export const DEFAULT_CONTEXT_WINDOW = 32768;
export const SAFETY_BUFFER = 2000;

export function estimateTokens(messages: Message[]): number {
  return Math.ceil(messages.reduce((total, message) => total + (message.content?.length || 0) + JSON.stringify(message.tool_calls || '').length, 0) / 4);
}

export function compactMessages(messages: Message[], contextWindow: number, limit: number | null | undefined, pruneOldOutputs = false): { messages: Message[]; compacted: boolean } {
  const threshold = Math.max(1, Math.floor(contextWindow * ((limit ?? 100) / 100)) - (limit == null ? SAFETY_BUFFER : 0));
  if (estimateTokens(messages) < threshold) return { messages, compacted: false };
  let compacted = messages.map(message => ({ ...message }));
  if (pruneOldOutputs) {
    const toolIndexes = compacted.map((message, index) => message.role === 'tool' ? index : -1).filter(index => index >= 0);
    for (const index of toolIndexes.slice(0, Math.max(0, toolIndexes.length - 2))) compacted[index] = { ...compacted[index], content: '[Earlier tool output pruned during context compaction.]' };
  }
  while (estimateTokens(compacted) >= threshold && compacted.length > 2) {
    const users = compacted.map((message, index) => message.role === 'user' ? index : -1).filter(index => index >= 0);
    if (users.length < 2) break;
    const removeAt = users[0];
    const end = users[1];
    compacted.splice(removeAt, end - removeAt);
  }
  return { messages: compacted, compacted: compacted.length !== messages.length || compacted.some((message, index) => message.content !== messages[index]?.content) };
}
