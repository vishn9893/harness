import { describe, expect, it } from 'vitest';
import { compactMessages, estimateTokens } from '../src/agent/Compactor';
import { Message } from '../src/llm/types';

const user = (content: string): Message => ({ role: 'user', content });

describe('context compaction', () => {
  it('compacts at the configured percentage while retaining the latest turn', () => {
    const messages = [user('old'.repeat(100)), { role: 'assistant', content: 'answer' } as Message, user('latest')];
    const result = compactMessages(messages, 100, 80);
    expect(result.compacted).toBe(true);
    expect(result.messages.at(-1)?.content).toBe('latest');
  });

  it('prunes older tool outputs and keeps recent output', () => {
    const messages: Message[] = [user('request'), { role: 'tool', name: 'x', tool_call_id: '1', content: 'old'.repeat(100) }, { role: 'tool', name: 'x', tool_call_id: '2', content: 'middle'.repeat(100) }, { role: 'tool', name: 'x', tool_call_id: '3', content: 'new'.repeat(100) }];
    const result = compactMessages(messages, 100, 80, true);
    expect(result.messages[1].content).toContain('pruned');
    expect(result.messages[3].content).toBe('new'.repeat(100));
    expect(estimateTokens(result.messages)).toBeLessThan(estimateTokens(messages));
  });
});
