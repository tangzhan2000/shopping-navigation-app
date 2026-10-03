import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface SnapshotIO {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  syncDirectory(path: string): Promise<void>;
}

const defaultIO: SnapshotIO = {
  read: async (path) => readFile(path, 'utf8'),
  async write(path, content) {
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
  },
  rename: async (from, to) => rename(from, to),
  async syncDirectory(path) {
    const handle = await open(path, constants.O_RDONLY);
    try { await handle.sync(); }
    finally { await handle.close(); }
  },
};

function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

export class SnapshotLockTimeoutError extends Error {
  public constructor(path: string) {
    super(`Timed out acquiring JSON snapshot lock: ${path}`);
    this.name = 'SnapshotLockTimeoutError';
  }
}

export class JsonSnapshot<T> {
  private state: T | undefined;
  private pending: Promise<void> = Promise.resolve();
  private uncertain = false;

  public constructor(private readonly path: string, private readonly empty: () => T,
    private readonly decode: (raw: unknown) => T | Promise<T>, private readonly io: SnapshotIO = defaultIO) {}

  private lockPath(): string { return `${this.path}.lock`; }

  private async acquireLock(): Promise<() => Promise<void>> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lockPath = this.lockPath();
    const deadline = Date.now() + 2_000;
    while (true) {
      try {
        const handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try { await handle.writeFile(`${process.pid}:${randomUUID()}`, 'utf8'); }
        finally { await handle.close(); }
        return async () => { await unlink(lockPath).catch(() => undefined); };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new SnapshotLockTimeoutError(lockPath);
          throw error;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
      }
    }
  }

  private async load(): Promise<T> {
    const directory = dirname(this.path);
    try {
      const file = await stat(this.path);
      if (!file.isFile() || (file.mode & 0o777) !== 0o600) throw new Error('Unsafe JSON snapshot permissions');
      const parent = await stat(directory);
      if (!parent.isDirectory() || (parent.mode & 0o022) !== 0) throw new Error('Unsafe JSON snapshot directory permissions');
      try { return await this.decode(JSON.parse(await this.io.read(this.path)) as unknown); }
      catch (error) { if (isMissing(error)) throw new Error('JSON snapshot disappeared during read', { cause: error }); throw error; }
    } catch (error) {
      if (isMissing(error)) {
        // A missing parent is valid only when the snapshot itself is also absent.
        try {
          const parent = await stat(directory);
          if (!parent.isDirectory() || (parent.mode & 0o022) !== 0) throw new Error('Unsafe JSON snapshot directory permissions');
        } catch (checkError) {
          if (!isMissing(checkError)) throw checkError;
          return this.empty();
        }
        try { await stat(this.path); } catch (checkError) { if (isMissing(checkError)) return this.empty(); throw checkError; }
      }
      throw error;
    }
  }

  private async current(): Promise<T> {
    if (this.state === undefined || this.uncertain) {
      this.state = await this.load();
      this.uncertain = false;
    }
    return this.state;
  }

  private async persist(next: T): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const parent = await stat(directory);
    if (!parent.isDirectory() || (parent.mode & 0o022) !== 0) throw new Error('Unsafe JSON snapshot directory permissions');
    const temporary = join(directory, `.${basename(this.path)}.${process.pid}.${randomUUID()}.tmp`);
    let renamed = false;
    try {
      await this.io.write(temporary, JSON.stringify(next));
      await this.io.rename(temporary, this.path);
      renamed = true;
      this.uncertain = true;
      await this.io.syncDirectory(directory);
    } finally {
      if (!renamed) await unlink(temporary).catch(() => undefined);
    }
  }

  private schedule<R>(action: () => Promise<R>): Promise<R> {
    const result = this.pending.then(action);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  public read<R>(reader: (state: T) => R | Promise<R>): Promise<R> {
    return this.schedule(async () => reader(structuredClone(await this.load())));
  }

  public change<R>(mutator: (state: T) => Promise<{ state: T; result: R }> | { state: T; result: R }): Promise<R> {
    return this.schedule(async () => {
      const release = await this.acquireLock();
      try {
        const prior = await this.load();
        const { state, result } = await mutator(structuredClone(prior));
        if (JSON.stringify(state) === JSON.stringify(prior)) {
          this.state = prior;
          this.uncertain = false;
          return result;
        }
        await this.persist(state);
        this.state = state;
        this.uncertain = false;
        return result;
      } finally {
        await release();
      }
    });
  }
}
