import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safePath } from './utils';

const SNAPSHOT_DIR = '.nightfall/snapshots';

export async function snapshotBeforeWrite(root: string, file: string): Promise<string | undefined> {
  const relative = path.relative(root, file);
  let content: string;
  let existed = true;
  try { content = await fs.readFile(file, 'utf8'); } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    content = '';
    existed = false;
  }
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const directory = path.join(root, SNAPSHOT_DIR, id);
  const snapshotFile = path.join(directory, relative);
  await fs.mkdir(path.dirname(snapshotFile), { recursive: true });
  if (existed) await fs.writeFile(snapshotFile, content, 'utf8');
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ files: [{ path: relative, existed }] }, null, 2), 'utf8');
  return id;
}

export async function restoreLatestSnapshot(root: string): Promise<string> {
  const parent = path.join(root, SNAPSHOT_DIR);
  const entries = await fs.readdir(parent, { withFileTypes: true }).catch(() => [] as any[]);
  const snapshots = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
  if (!snapshots.length) throw new Error('No snapshots are available.');
  const directory = path.join(parent, snapshots[0]);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as { files: Array<{ path: string; existed: boolean }> };
  for (const item of manifest.files) {
    const target = safePath(root, item.path);
    if (item.existed) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(directory, item.path), target);
    } else await fs.rm(target, { force: true });
  }
  return snapshots[0];
}
