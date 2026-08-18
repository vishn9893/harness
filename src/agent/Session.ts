import { AgentSession } from './types';
import { Message } from '../llm/types';
import { randomUUID } from 'node:crypto';
export function newSession(): AgentSession { const now = Date.now(); return { id: randomUUID(), messages: [], contextFiles: [], createdAt: now, updatedAt: now }; }
export function clearSession(session: AgentSession): void { session.messages = []; session.contextFiles = []; session.updatedAt = Date.now(); }
export function append(session: AgentSession, message: Message): void { session.messages.push(message); session.updatedAt = Date.now(); }
