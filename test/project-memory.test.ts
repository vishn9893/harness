import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { appendProjectMemory, projectMemoryPath, readProjectMemory } from '../src/agent/ProjectMemory';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

describe('project memory', () => {
  it('round-trips durable facts in the project memory file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-agent-memory-')); roots.push(root);
    await appendProjectMemory(root, '- The extension entrypoint is `src/extension.ts`.');
    expect(await readProjectMemory(root)).toContain('The extension entrypoint');
    expect(projectMemoryPath(root)).toContain(path.join('.nightfall', 'project-memory.md'));
  });

  it('does not create a file for an empty extraction', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-agent-memory-')); roots.push(root);
    await appendProjectMemory(root, 'NONE');
    await expect(fs.access(projectMemoryPath(root))).rejects.toThrow();
  });
});
