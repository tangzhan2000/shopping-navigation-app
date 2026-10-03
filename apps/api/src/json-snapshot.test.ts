import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileRecognitionTaskStore } from './recognition-store.js';
import { JsonFileEventStore } from './event-file-store.js';
import { JsonFileJobQueue } from './worker.js';
import type { SnapshotIO } from './json-snapshot.js';

const event = (id: string) => ({ eventId: id, eventType: 'task.created', schemaVersion: 1, aggregateType: 'task', aggregateId: 'task-1', occurredAt: '2026-01-01T00:00:00.000Z', correlationId: 'corr-1', payload: { id }, metadata: { actorType: 'system' as const, policyVersion: 'v1' } });

interface Adapter {
  seed(): Promise<void>;
  add(): Promise<void>;
  records(): Promise<number>;
}

const adapters: Record<string, (path: string, io?: SnapshotIO) => Adapter> = {
  recognition(path, io) {
    const store = new JsonFileRecognitionTaskStore(path, io);
    return {
      seed: async () => { await store.create({ taskId: 'first', userId: 'user-1', inputType: 'text', content: 'first item' }); },
      add: async () => { await store.create({ taskId: 'second', userId: 'user-1', inputType: 'text', content: 'second item' }); },
      records: async () => Number(await store.get('first', 'user-1') !== undefined) + Number(await store.get('second', 'user-1') !== undefined),
    };
  },
  events(path, io) {
    const store = new JsonFileEventStore(path, io);
    return {
      seed: () => store.append(event('first')),
      add: () => store.append(event('second')),
      records: async () => (await store.list()).length,
    };
  },
  jobs(path, io) {
    const store = new JsonFileJobQueue(path, io);
    return {
      seed: async () => { await store.enqueue({ jobId: 'first', type: 'recognition.parse', payload: {}, idempotencyKey: 'first' }); },
      add: async () => { await store.enqueue({ jobId: 'second', type: 'recognition.parse', payload: {}, idempotencyKey: 'second' }); },
      records: async () => (await store.list()).length,
    };
  },
};

type Stage = 'write' | 'rename' | 'syncDirectory';

function injectedIO(stage: Stage): SnapshotIO & { failures: number; operations: string[] } {
  const operations: string[] = [];
  let failures = 1;
  const fail = (operation: Stage): void => {
    operations.push(operation);
    if (operation === stage && failures > 0) { failures -= 1; throw new Error(`injected ${operation} failure`); }
  };
  return {
    get failures() { return failures; }, operations,
    read: (path) => readFile(path, 'utf8'),
    async write(path, content) { fail('write'); await writeFile(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); },
    async rename(from, to) { fail('rename'); await rename(from, to); },
    async syncDirectory() { fail('syncDirectory'); },
  };
}

describe.each(Object.entries(adapters))('%s snapshot fault injection', (_name, createAdapter) => {
  it.each(['write', 'rename'] as const)('does not publish partial data after %s failure and allows a subsequent retry', async (stage) => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-snapshot-fault-'));
    const path = join(directory, 'store.json');
    try {
      await createAdapter(path).seed();
      const before = await readFile(path, 'utf8');
      const io = injectedIO(stage);
      const adapter = createAdapter(path, io);
      await expect(adapter.add()).rejects.toThrow(`injected ${stage} failure`);
      expect(await readFile(path, 'utf8')).toBe(before);
      expect(await createAdapter(path).records()).toBe(1);
      expect((await readdir(directory)).sort()).toEqual(['store.json']);
      await adapter.add();
      expect(await createAdapter(path).records()).toBe(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('cleans up an incomplete temporary snapshot after a partial write', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-snapshot-partial-'));
    const path = join(directory, 'store.json');
    try {
      await createAdapter(path).seed();
      const before = await readFile(path, 'utf8');
      let injected = false;
      const io: SnapshotIO = {
        read: (file) => readFile(file, 'utf8'),
        async write(file) {
          if (!injected) {
            injected = true;
            await writeFile(file, '{partial', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
            throw new Error('injected partial write');
          }
          await writeFile(file, before, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        },
        rename: (from, to) => rename(from, to),
        syncDirectory: async () => undefined,
      };
      await expect(createAdapter(path, io).add()).rejects.toThrow('injected partial write');
      expect(await readFile(path, 'utf8')).toBe(before);
      expect((await readdir(directory)).sort()).toEqual(['store.json']);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('reloads committed disk state after directory sync fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-snapshot-sync-'));
    const path = join(directory, 'store.json');
    try {
      await createAdapter(path).seed();
      const io = injectedIO('syncDirectory');
      const adapter = createAdapter(path, io);
      await expect(adapter.add()).rejects.toThrow('injected syncDirectory failure');
      expect(io.operations).toEqual(['write', 'rename', 'syncDirectory']);
      expect(await createAdapter(path).records()).toBe(2);
      expect(await adapter.records()).toBe(2);
      expect((await readdir(directory)).sort()).toEqual(['store.json']);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('surfaces injected read errors rather than silently treating the snapshot as empty', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-snapshot-read-'));
    const path = join(directory, 'store.json');
    try {
      await createAdapter(path).seed();
      const io: SnapshotIO = {
        read: async () => { throw new Error('injected read failure'); },
        write: async () => { throw new Error('unexpected write'); },
        rename: async () => { throw new Error('unexpected rename'); },
        syncDirectory: async () => { throw new Error('unexpected sync'); },
      };
      await expect(createAdapter(path, io).records()).rejects.toThrow('injected read failure');
      expect(await createAdapter(path).records()).toBe(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
