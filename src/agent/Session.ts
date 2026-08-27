import { AgentSession } from './types';
import { Message } from '../llm/types';
import { randomUUID } from 'node:crypto';
export function newSession(): AgentSession { const now = Date.now(); return { id: randomUUID(), messages: [], contextFiles: [], autoApproveTools: false, stats: { inputTokens: 0, outputTokens: 0, elapsedMs: 0 }, createdAt: now, updatedAt: now }; }
export function clearSession(session: AgentSession): void { session.messages = []; session.contextFiles = []; session.title = undefined; session.stats = { inputTokens: 0, outputTokens: 0, elapsedMs: 0 }; session.updatedAt = Date.now(); }
export function append(session: AgentSession, message: Message): void { session.messages.push(message); session.updatedAt = Date.now(); }
