import { randomUUID } from 'node:crypto';
import { JsonSnapshot, type SnapshotIO } from './json-snapshot.js';

export interface WorkerJob {
  readonly jobId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly idempotencyKey: string;
  readonly availableAt?: number;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'retrying' | 'dead_letter';

export interface JobRecord extends WorkerJob {
  readonly status: JobStatus;
  readonly attempts: number;
  readonly lastError?: string;
  readonly leaseUntil?: number;
  readonly leaseToken?: string;
}

export type LeasedJobRecord = JobRecord & {
  readonly status: 'processing';
  readonly leaseUntil: number;
  readonly leaseToken: string;
};

export interface JobClaim {
  readonly job: LeasedJobRecord;
  readonly leaseToken: string;
}
export interface JobQueue {
  enqueue(job: WorkerJob): Promise<JobRecord>;
  claim(now?: number, leaseMs?: number): Promise<LeasedJobRecord | undefined>;
  ack(jobId: string, leaseToken: string): Promise<JobRecord>;
  fail(jobId: string, error: unknown, now: number | undefined, leaseToken: string): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord | undefined>;
  list(status?: JobStatus): Promise<readonly JobRecord[]>;
}

export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, JobRecord>();

  public async enqueue(job: WorkerJob): Promise<JobRecord> {
    const existing = [...this.jobs.values()].find((item) => item.idempotencyKey === job.idempotencyKey);
    if (existing) return structuredClone(existing);
    if (this.jobs.has(job.jobId)) throw new Error(`Duplicate job ${job.jobId}`);
    const record: JobRecord = { ...structuredClone(job), status: 'queued', attempts: 0 };
    this.jobs.set(job.jobId, record);
    return structuredClone(record);
  }

  public async claim(now = Date.now(), leaseMs = 30_000): Promise<LeasedJobRecord | undefined> {
    const candidate = [...this.jobs.values()]
      .filter((job) => (job.status === 'queued' || job.status === 'retrying' || (job.status === 'processing' && (job.leaseUntil ?? 0) <= now)) && (job.availableAt ?? 0) <= now)
      .sort((left, right) => (left.availableAt ?? 0) - (right.availableAt ?? 0) || left.jobId.localeCompare(right.jobId))[0];
    if (!candidate) return undefined;
    const claimed: LeasedJobRecord = { ...candidate, status: 'processing', attempts: candidate.attempts + 1, leaseUntil: now + leaseMs, leaseToken: randomUUID() };
    this.jobs.set(candidate.jobId, claimed);
    return structuredClone(claimed);
  }

  public async ack(jobId: string, leaseToken: string): Promise<JobRecord> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'processing' || job.leaseToken !== leaseToken) throw new Error(`Job ${jobId} is not owned by this lease`);
    const completed: JobRecord = { jobId: job.jobId, type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, status: 'completed', attempts: job.attempts };
    this.jobs.set(jobId, completed);
    return structuredClone(completed);
  }

  public async fail(jobId: string, error: unknown, now = Date.now(), leaseToken: string): Promise<JobRecord> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'processing' || job.leaseToken !== leaseToken) throw new Error(`Job ${jobId} is not owned by this lease`);
    const message = error instanceof Error ? error.message : String(error);
    const terminal = job.attempts >= 3;
    const failed: JobRecord = terminal
      ? { jobId: job.jobId, type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, status: 'dead_letter', attempts: job.attempts, availableAt: now, lastError: message }
      : { jobId: job.jobId, type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, status: 'retrying', attempts: job.attempts, availableAt: now + (2 ** job.attempts) * 100, lastError: message };
    this.jobs.set(jobId, failed);
    return structuredClone(failed);
  }

  public async get(jobId: string): Promise<JobRecord | undefined> {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : undefined;
  }

  public async list(status?: JobStatus): Promise<readonly JobRecord[]> {
    return [...this.jobs.values()].filter((job) => status === undefined || job.status === status).map((job) => structuredClone(job));
  }
}

interface JobFileState { readonly schemaVersion: 1; readonly jobs: readonly JobRecord[]; }

function decodeJobState(raw: unknown): JobFileState {
  if (!raw || typeof raw !== 'object') throw new Error('Unsupported job store schema');
  const state = raw as Partial<JobFileState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.jobs)) throw new Error('Unsupported job store schema');
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const job of state.jobs) {
    if (!job || typeof job.jobId !== 'string' || !job.jobId || typeof job.type !== 'string' || !job.type
      || typeof job.idempotencyKey !== 'string' || !job.idempotencyKey || job.payload === undefined
      || !['queued', 'processing', 'completed', 'retrying', 'dead_letter'].includes(job.status)
      || !Number.isInteger(job.attempts) || job.attempts < 0
      || (job.availableAt !== undefined && !Number.isFinite(job.availableAt))
      || (job.leaseUntil !== undefined && !Number.isFinite(job.leaseUntil))
      || (job.leaseToken !== undefined && (typeof job.leaseToken !== 'string' || !job.leaseToken))
      || (job.status === 'processing' && (job.leaseUntil === undefined || job.leaseToken === undefined))
      || (job.status !== 'processing' && (job.leaseUntil !== undefined || job.leaseToken !== undefined))
      || (job.lastError !== undefined && typeof job.lastError !== 'string')
      || ids.has(job.jobId) || keys.has(job.idempotencyKey)) throw new Error('Invalid job record');
    ids.add(job.jobId);
    keys.add(job.idempotencyKey);
  }
  return { schemaVersion: 1, jobs: state.jobs };
}

export class JsonFileJobQueue implements JobQueue {
  private readonly snapshot: JsonSnapshot<JobFileState>;

  public constructor(filePath: string, io?: SnapshotIO) {
    this.snapshot = new JsonSnapshot(filePath, () => ({ schemaVersion: 1, jobs: [] }), decodeJobState, io);
  }
  public enqueue(job: WorkerJob): Promise<JobRecord> {
    return this.snapshot.change((state) => {
      const existing = state.jobs.find((item) => item.idempotencyKey === job.idempotencyKey);
      if (existing) return { state, result: existing };
      if (state.jobs.some((item) => item.jobId === job.jobId)) throw new Error(`Duplicate job ${job.jobId}`);
      const result: JobRecord = { ...structuredClone(job), status: 'queued', attempts: 0 };
      return { state: { schemaVersion: 1, jobs: [...state.jobs, result] }, result };
    });
  }
  public async claim(now = Date.now(), leaseMs = 30_000): Promise<LeasedJobRecord | undefined> {
    return this.snapshot.change((state) => {
      const candidate = state.jobs.filter((job) => (job.status === 'queued' || job.status === 'retrying' || (job.status === 'processing' && (job.leaseUntil ?? 0) <= now)) && (job.availableAt ?? 0) <= now)
        .sort((left, right) => (left.availableAt ?? 0) - (right.availableAt ?? 0) || left.jobId.localeCompare(right.jobId))[0];
      if (!candidate) return { state, result: undefined };
      const result: LeasedJobRecord = { ...candidate, status: 'processing', attempts: candidate.attempts + 1, leaseUntil: now + leaseMs, leaseToken: randomUUID() };
      return { state: { schemaVersion: 1, jobs: state.jobs.map((job) => job.jobId === result.jobId ? result : job) }, result };
    });
  }
  public async ack(jobId: string, leaseToken: string): Promise<JobRecord> {
    return this.snapshot.change((state) => {
      const job = state.jobs.find((item) => item.jobId === jobId);
      if (!job || job.status !== 'processing' || job.leaseToken !== leaseToken) throw new Error(`Job ${jobId} is not owned by this lease`);
      const result: JobRecord = { jobId: job.jobId, type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, status: 'completed', attempts: job.attempts };
      return { state: { schemaVersion: 1, jobs: state.jobs.map((item) => item.jobId === jobId ? result : item) }, result };
    });
  }
  public async fail(jobId: string, error: unknown, now = Date.now(), leaseToken: string): Promise<JobRecord> {
    return this.snapshot.change((state) => {
      const job = state.jobs.find((item) => item.jobId === jobId);
      if (!job || job.status !== 'processing' || job.leaseToken !== leaseToken) throw new Error(`Job ${jobId} is not owned by this lease`);
      const message = error instanceof Error ? error.message : String(error);
      const result: JobRecord = job.attempts >= 3
        ? { jobId: job.jobId, type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, status: 'dead_letter', attempts: job.attempts, availableAt: now, lastError: message }
        : { jobId: job.jobId, type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, status: 'retrying', attempts: job.attempts, availableAt: now + (2 ** job.attempts) * 100, lastError: message };
      return { state: { schemaVersion: 1, jobs: state.jobs.map((item) => item.jobId === jobId ? result : item) }, result };
    });
  }
  public get(jobId: string): Promise<JobRecord | undefined> {
    return this.snapshot.read((state) => state.jobs.find((job) => job.jobId === jobId));
  }
  public list(status?: JobStatus): Promise<readonly JobRecord[]> {
    return this.snapshot.read((state) => state.jobs.filter((job) => status === undefined || job.status === status));
  }
}

export interface JobHandler { (job: WorkerJob): Promise<void> | void; }

export interface WorkerOutcome { readonly jobId: string; readonly status: 'completed' | 'retrying' | 'dead_letter' | 'idle' | 'unsupported'; }

export class Worker {
  public constructor(private readonly queue: JobQueue, private readonly handlers: ReadonlyMap<string, JobHandler>) {}

  public async runOnce(now = Date.now()): Promise<WorkerOutcome> {
    const job = await this.queue.claim(now);
    if (!job) return { jobId: '', status: 'idle' };
    const leaseToken = job.leaseToken;
    const handler = this.handlers.get(job.type);
    if (!handler) {
      const result = await this.queue.fail(job.jobId, new Error(`Unsupported job type ${job.type}`), now, leaseToken);
      return { jobId: job.jobId, status: result.status === 'dead_letter' ? 'dead_letter' : 'unsupported' };
    }
    try {
      await handler(job);
    } catch (error) {
      const result = await this.queue.fail(job.jobId, error, now, leaseToken);
      return { jobId: job.jobId, status: result.status === 'dead_letter' ? 'dead_letter' : 'retrying' };
    }
    await this.queue.ack(job.jobId, leaseToken);
    return { jobId: job.jobId, status: 'completed' };
  }

  public async drain(now = Date.now(), limit = 100): Promise<readonly WorkerOutcome[]> {
    const outcomes: WorkerOutcome[] = [];
    for (let index = 0; index < limit; index += 1) {
      const outcome = await this.runOnce(now === undefined ? Date.now() : now);
      if (outcome.status === 'idle') break;
      outcomes.push(outcome);
    }
    return outcomes;
  }
}

export function describeWorker(): string {
  return 'Deterministic local worker with idempotent enqueue, bounded retry, and dead-letter outcomes.';
}
