import * as path from 'node:path';
import * as fs from 'node:fs/promises';
export function safePath(root: string, requested = '.'): string {
  const resolved = path.resolve(root, requested);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path is outside the workspace');
  return resolved;
}
export const bounded = (value: string, max = 20000) => value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
export async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
