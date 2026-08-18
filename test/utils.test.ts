import { describe, expect, it } from 'vitest'; import { safePath } from '../src/tools/utils';
describe('safePath', () => { it('allows workspace paths', () => expect(safePath('/workspace', 'src/a.ts')).toBe('/workspace/src/a.ts')); it('rejects traversal', () => expect(() => safePath('/workspace', '../secret')).toThrow('outside')); });
