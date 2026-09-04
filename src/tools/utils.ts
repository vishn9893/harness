import * as path from 'node:path';
import * as fs from 'node:fs/promises';
export function safePath(root: string, requested = '.'): string {
  const resolved = path.resolve(root, requested);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path is outside the workspace');
  return resolved;
}
export function resolvePath(root: string, requested = '.', externalDirectories: string[] = []): string {
  const resolved = path.resolve(root, requested); const relative = path.relative(path.resolve(root), resolved);
  if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) return resolved;
  const allowed = externalDirectories.some(directory => directory === '*' || (() => { const base = path.resolve(root, directory); const child = path.relative(base, resolved); return child === '' || (child !== '..' && !child.startsWith(`..${path.sep}`) && !path.isAbsolute(child)); })());
  if (!allowed) throw new Error('Path is outside the workspace and is not an allowed external directory'); return resolved;
}
export function isExternalPath(root: string, requested = '.'): boolean { const relative = path.relative(path.resolve(root), path.resolve(root, requested)); return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative); }
export const bounded = (value: string, max = 20000) => value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
export async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
