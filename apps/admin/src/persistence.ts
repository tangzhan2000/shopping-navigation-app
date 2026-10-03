import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { AdminState, AdminStateStore } from './index.js';

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function decodeState(raw: unknown): AdminState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid admin state schema');
  const state = raw as Partial<AdminState>;
  if (state.schemaVersion !== 1 || !Number.isInteger(state.sequence) || state.sequence! < 0
    || !Array.isArray(state.sources) || !Array.isArray(state.evidence)
    || !Array.isArray(state.cases) || !Array.isArray(state.auditRecords)) {
    throw new Error('Invalid admin state schema');
  }
  return structuredClone(state as AdminState);
}

export class JsonAdminStateStore implements AdminStateStore {
  public constructor(private readonly path: string) {}

  public async load(): Promise<AdminState | undefined> {
    try {
      const file = await stat(this.path);
      if (!file.isFile() || (file.mode & 0o777) !== 0o600) throw new Error('Unsafe admin state permissions');
      const parent = await stat(dirname(this.path));
      if (!parent.isDirectory() || (parent.mode & 0o022) !== 0) throw new Error('Unsafe admin state directory permissions');
      return decodeState(JSON.parse(await readFile(this.path, 'utf8')) as unknown);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  public async save(state: AdminState): Promise<void> {
    const encoded = decodeState(state);
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${basename(this.path)}.${process.pid}.tmp`);
    const handle = await open(temporary, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY, 0o600);
    try {
      await handle.writeFile(JSON.stringify(encoded), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.path);
      const directoryHandle = await open(directory, constants.O_RDONLY);
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}

export async function restoreAdminModel(store: AdminStateStore, model: { restoreState(state: AdminState): void }): Promise<void> {
  const state = await store.load();
  if (state) model.restoreState(state);
}
