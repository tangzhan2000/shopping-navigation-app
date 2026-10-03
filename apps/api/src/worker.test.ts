import { describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryJobQueue, JsonFileJobQueue, Worker, type JobQueue, type WorkerJob } from './worker.js';

const job = (jobId: string, idempotencyKey = jobId): WorkerJob => ({ jobId, type: 'recognition.parse', payload: { value: jobId }, idempotencyKey });

async function tempFile(): Promise<{ directory: string; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'shopping-jobs-'));
  return { directory, file: join(directory, 'jobs.json') };
}

async function exerciseQueue(queue: JobQueue): Promise<void> {
  expect(await queue.enqueue(job('job-1', 'event-1'))).toMatchObject({ status: 'queued', attempts: 0 });
  expect((await queue.enqueue(job('job-2', 'event-1'))).jobId).toBe('job-1');
  const firstClaim = await queue.claim(1000, 100);
  expect(firstClaim).toMatchObject({ jobId: 'job-1', status: 'processing', attempts: 1 });
  const firstToken = firstClaim?.leaseToken;
  expect(firstToken).toEqual(expect.any(String));
  expect(await queue.claim(1050, 100)).toBeUndefined();
  expect(await queue.fail('job-1', new Error('transient'), 1050, firstToken!)).toMatchObject({ status: 'retrying', attempts: 1 });
  expect(await queue.claim(1249, 100)).toBeUndefined();
  const secondClaim = await queue.claim(1250, 100);
  expect(secondClaim).toMatchObject({ jobId: 'job-1', status: 'processing', attempts: 2 });
  expect(await queue.ack('job-1', secondClaim!.leaseToken!)).toMatchObject({ status: 'completed', attempts: 2 });
  expect(await queue.list('completed')).toHaveLength(1);
}

describe('local worker', () => {
  it('deduplicates enqueue and completes a supported job', async () => {
    const queue = new InMemoryJobQueue();
    const seen: string[] = [];
    const worker = new Worker(queue, new Map([['recognition.parse', (item) => { seen.push(item.jobId); }]]));
    await queue.enqueue(job('job-1', 'event-1'));
    expect((await queue.enqueue(job('job-2', 'event-1'))).jobId).toBe('job-1');
    await expect(worker.runOnce(1000)).resolves.toMatchObject({ jobId: 'job-1', status: 'completed' });
    expect(seen).toEqual(['job-1']);
  });

  it('retries failures and dead-letters after the bounded attempts', async () => {
    const queue = new InMemoryJobQueue();
    const worker = new Worker(queue, new Map([['flaky', () => { throw new Error('provider unavailable'); }]]));
    await queue.enqueue({ ...job('job-2', 'event-2'), type: 'flaky' });
    await expect(worker.runOnce(1000)).resolves.toMatchObject({ status: 'retrying' });
    await expect(worker.runOnce(1200)).resolves.toMatchObject({ status: 'retrying' });
    await expect(worker.runOnce(1600)).resolves.toMatchObject({ status: 'dead_letter' });
    expect(await queue.get('job-2')).toMatchObject({ status: 'dead_letter', attempts: 3, lastError: 'provider unavailable' });
  });

  it('keeps externally gated job types explicit and non-successful', async () => {
    const queue = new InMemoryJobQueue();
    const worker = new Worker(queue, new Map());
    await queue.enqueue({ ...job('job-3', 'event-3'), type: 'payout.execute' });
    await expect(worker.runOnce(1000)).resolves.toMatchObject({ status: 'unsupported' });
  });
});

describe('JsonFileJobQueue', () => {
  it('matches memory queue transitions and preserves deduplication across restart', async () => {
    const location = await tempFile();
    try {
      const memory = new InMemoryJobQueue();
      const first = new JsonFileJobQueue(location.file);
      await exerciseQueue(memory);
      await exerciseQueue(first);
      const second = new JsonFileJobQueue(location.file);
      expect(await second.list()).toEqual(await memory.list());
      expect(await second.get('job-1')).toEqual(await memory.get('job-1'));
      expect((await second.enqueue(job('job-2', 'event-1'))).jobId).toBe('job-1');
      expect((await second.enqueue(job('job-3', 'event-3'))).jobId).toBe('job-3');
      expect(await new JsonFileJobQueue(location.file).list()).toEqual(await second.list());
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('recovers an expired processing lease and persists retries after restart', async () => {
    const location = await tempFile();
    try {
      const first = new JsonFileJobQueue(location.file);
      await first.enqueue(job('lease-job'));
      const initialClaim = await first.claim(1000, 100);
      expect(initialClaim).toMatchObject({ status: 'processing', attempts: 1 });
      const second = new JsonFileJobQueue(location.file);
      expect(await second.claim(1099, 100)).toBeUndefined();
      const retryClaim = await second.claim(1100, 100);
      expect(retryClaim).toMatchObject({ status: 'processing', attempts: 2 });
      await expect(first.ack('lease-job', initialClaim!.leaseToken!)).rejects.toThrow('not owned');
      expect(await second.fail('lease-job', new Error('unavailable'), 1100, retryClaim!.leaseToken!)).toMatchObject({ status: 'retrying', attempts: 2 });
      expect(await new JsonFileJobQueue(location.file).get('lease-job')).toMatchObject({ status: 'retrying', attempts: 2, lastError: 'unavailable' });
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('rejects malformed and unsupported files rather than treating them as empty', async () => {
    const location = await tempFile();
    try {
      for (const corrupt of ['{broken', '{"schemaVersion":999,"jobs":[]}', '{"schemaVersion":1,"jobs":[{}]}']) {
        await writeFile(location.file, corrupt, { mode: 0o600 });
        await expect(new JsonFileJobQueue(location.file).list()).rejects.toThrow();
        expect(await readFile(location.file, 'utf8')).toBe(corrupt);
      }
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('protects snapshots and newly created parent directories', async () => {
    const location = await tempFile();
    const parent = join(location.directory, 'private');
    const file = join(parent, 'jobs.json');
    try {
      await new JsonFileJobQueue(file).enqueue(job('private-job'));
      expect((await stat(parent)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await chmod(file, 0o644);
      await expect(new JsonFileJobQueue(file).list()).rejects.toThrow();
      await chmod(file, 0o600);
      await chmod(parent, 0o777);
      await expect(new JsonFileJobQueue(file).list()).rejects.toThrow();
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });
});
