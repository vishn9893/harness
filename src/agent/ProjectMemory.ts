import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const memoryRelativePath = path.join('.nightfall', 'project-memory.md');
const maxMemoryCharacters = 50000;

export function projectMemoryPath(root: string): string {
  return path.join(root, memoryRelativePath);
}
export async function readProjectMemory(root: string): Promise<string> {
  try {
    return (await fs.readFile(projectMemoryPath(root), 'utf8')).slice(0, maxMemoryCharacters);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

export async function appendProjectMemory(root: string, facts: string): Promise<void> {
  const cleaned = facts.trim();
  if (!cleaned || cleaned.toLowerCase() === 'none') return;
  const file = projectMemoryPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const existing = await readProjectMemory(root);
  const entry = `\n## ${new Date().toISOString().slice(0, 10)}\n${cleaned}\n`;
  await fs.writeFile(file, `${(existing || '# Project memory\n').trimEnd()}\n${entry}`.slice(-maxMemoryCharacters), 'utf8');
}
