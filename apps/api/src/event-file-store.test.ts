import { describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileEventStore } from './event-file-store.js';
import { AggregateVersionConflictError, DuplicateEventError, InMemoryEventStore } from './event-store.js';

const makeEvent = (id: string, aggregateId = 'task-1') => ({ eventId: id, eventType: 'task.created', schemaVersion: 1, aggregateType: 'task', aggregateId, occurredAt: '2026-01-01T00:00:00.000Z', correlationId: 'corr-1', payload: { id }, metadata: { actorType: 'system' as const, policyVersion: 'v1' } });

async function tempFile(): Promise<{ directory: string; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'shopping-events-'));
  return { directory, file: join(directory, 'events.json') };
}

describe('json event store', () => {
  it('persists and restores events with memory parity and aggregate filtering', async () => {
    const location = await tempFile();
    try {
      const memory = new InMemoryEventStore();
      const first = new JsonFileEventStore(location.file);
      for (const event of [makeEvent('event-1'), makeEvent('event-2', 'task-2')]) {
        await first.append(event, 0);
        await memory.append(event, 0);
      }
      expect(JSON.parse(await readFile(location.file, 'utf8')).schemaVersion).toBe(1);
      const second = new JsonFileEventStore(location.file);
      expect(await second.list()).toEqual(await memory.list());
      expect(await second.list('task-1')).toEqual(await memory.list('task-1'));
      expect(await second.get('event-1')).toEqual(await memory.get('event-1'));
      expect(await second.aggregateVersion('task-1')).toBe(1);
      await expect(second.append(makeEvent('event-1'), 1)).rejects.toThrow(DuplicateEventError);
      await expect(second.append(makeEvent('event-3'), 0)).rejects.toThrow(AggregateVersionConflictError);
      expect(await new JsonFileEventStore(location.file).list()).toEqual(await memory.list());
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('rejects malformed, unsupported and structurally invalid snapshots without overwriting them', async () => {
    const location = await tempFile();
    try {
      for (const corrupt of ['{broken', '{"schemaVersion":999,"events":[]}', '{"schemaVersion":1,"events":[{}]}']) {
        await writeFile(location.file, corrupt, { mode: 0o600 });
        await expect(new JsonFileEventStore(location.file).list()).rejects.toThrow();
        expect(await readFile(location.file, 'utf8')).toBe(corrupt);
      }
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('protects the snapshot and directory permissions on disk and on restart', async () => {
    const location = await tempFile();
    const parent = join(location.directory, 'private');
    const file = join(parent, 'events.json');
    try {
      await new JsonFileEventStore(file).append(makeEvent('event-1'), 0);
      expect((await stat(parent)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(await new JsonFileEventStore(file).aggregateVersion('task-1')).toBe(1);
      await chmod(file, 0o644);
      await expect(new JsonFileEventStore(file).list()).rejects.toThrow();
      await chmod(file, 0o600);
      await chmod(parent, 0o777);
      await expect(new JsonFileEventStore(file).list()).rejects.toThrow();
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });
});
