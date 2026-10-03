import { describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryRecognitionTaskStore, JsonFileRecognitionTaskStore } from './recognition-store.js';

async function tempFile(): Promise<{ directory: string; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'shopping-recognition-'));
  return { directory, file: join(directory, 'tasks.json') };
}

const input = { taskId: 'persist-1', userId: 'user-1', inputType: 'text' as const, content: '需要 2 件无香洗衣液' };

describe('JsonFileRecognitionTaskStore', () => {
  it('matches the memory store through create, confirmation, deletion, and restart', async () => {
    const location = await tempFile();
    try {
      const memory = new InMemoryRecognitionTaskStore();
      const first = new JsonFileRecognitionTaskStore(location.file);
      expect(await first.create(input)).toEqual(await memory.create(input));
      expect(await first.get(input.taskId, input.userId)).toEqual(await memory.get(input.taskId, input.userId));
      expect(await first.confirm(input.taskId, undefined, input.userId)).toEqual(await memory.confirm(input.taskId, undefined, input.userId));
      const restarted = new JsonFileRecognitionTaskStore(location.file);
      expect(await restarted.get(input.taskId, input.userId)).toEqual(await memory.get(input.taskId, input.userId));
      expect(await restarted.get(input.taskId, 'other-user')).toBeUndefined();
      expect(await restarted.delete(input.taskId, input.userId)).toEqual(await memory.delete(input.taskId, input.userId));
      expect(await new JsonFileRecognitionTaskStore(location.file).get(input.taskId, input.userId)).toEqual(await memory.get(input.taskId, input.userId));
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('does not allow another user to read, confirm, or delete a task', async () => {
    const location = await tempFile();
    try {
      const store = new JsonFileRecognitionTaskStore(location.file);
      const original = await store.create(input);
      expect(await store.get(input.taskId, 'other-user')).toBeUndefined();
      await expect(store.confirm(input.taskId, undefined, 'other-user')).rejects.toThrow();
      await expect(store.delete(input.taskId, 'other-user')).rejects.toThrow();
      expect(await new JsonFileRecognitionTaskStore(location.file).get(input.taskId, input.userId)).toEqual(original);
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('rejects duplicate task IDs without changing the persisted task', async () => {
    const location = await tempFile();
    try {
      const store = new JsonFileRecognitionTaskStore(location.file);
      const created = await store.create(input);
      await expect(store.create({ ...input, userId: 'other-user' })).rejects.toThrow();
      expect(await new JsonFileRecognitionTaskStore(location.file).get(input.taskId, input.userId)).toEqual(created);
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('writes a versioned file and rejects malformed state instead of resetting it', async () => {
    const location = await tempFile();
    try {
      const store = new JsonFileRecognitionTaskStore(location.file);
      await store.create(input);
      const state = JSON.parse(await readFile(location.file, 'utf8')) as { schemaVersion: number; tasks: unknown[] };
      expect(state.schemaVersion).toBe(1);
      expect(state.tasks).toHaveLength(1);
      for (const corrupt of ['{broken', '{"schemaVersion":999,"tasks":[]}', '{"schemaVersion":1,"tasks":[{}]}']) {
        await writeFile(location.file, corrupt, 'utf8');
        await expect(new JsonFileRecognitionTaskStore(location.file).get(input.taskId, input.userId)).rejects.toThrow();
        expect(await readFile(location.file, 'utf8')).toBe(corrupt);
      }
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('keeps snapshot and newly created parent directory private and rejects insecure permissions on restart', async () => {
    const location = await tempFile();
    const parent = join(location.directory, 'private');
    const file = join(parent, 'tasks.json');
    try {
      await new JsonFileRecognitionTaskStore(file).create(input);
      expect((await stat(parent)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(await new JsonFileRecognitionTaskStore(file).get(input.taskId, input.userId)).toMatchObject({ userId: input.userId });
      await chmod(file, 0o644);
      await expect(new JsonFileRecognitionTaskStore(file).get(input.taskId, input.userId)).rejects.toThrow();
      await chmod(file, 0o600);
      await chmod(parent, 0o777);
      await expect(new JsonFileRecognitionTaskStore(file).get(input.taskId, input.userId)).rejects.toThrow();
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });
});
