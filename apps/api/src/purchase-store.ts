import type { PurchaseProtectionCase } from '@shopping-navigation/contracts';
import { JsonSnapshot, type SnapshotIO } from './json-snapshot.js';

export interface PurchaseProtectionCaseRepository {
  create(caseRecord: PurchaseProtectionCase): Promise<PurchaseProtectionCase>;
  get(caseId: string): Promise<PurchaseProtectionCase | undefined>;
  update(caseRecord: PurchaseProtectionCase, expectedVersion: number): Promise<PurchaseProtectionCase>;
  listByUser(userId: string): Promise<readonly PurchaseProtectionCase[]>;
  listAll(): Promise<readonly PurchaseProtectionCase[]>;
}

export class CaseVersionConflictError extends Error {
  public constructor() { super('Purchase protection case version conflict'); this.name = 'CaseVersionConflictError'; }
}

export class CaseIdempotencyConflictError extends Error {
  public constructor() { super('Purchase protection case idempotency conflict'); this.name = 'CaseIdempotencyConflictError'; }
}

export class InMemoryPurchaseProtectionCaseRepository implements PurchaseProtectionCaseRepository {
  private readonly cases = new Map<string, PurchaseProtectionCase>();
  public async create(caseRecord: PurchaseProtectionCase): Promise<PurchaseProtectionCase> {
    const currentById = this.cases.get(caseRecord.caseId);
    if (currentById) {
      if (currentById.userId === caseRecord.userId && currentById.idempotencyKey === caseRecord.idempotencyKey) return currentById;
      throw new CaseIdempotencyConflictError();
    }
    const duplicate = [...this.cases.values()].find((item) => item.userId === caseRecord.userId && item.idempotencyKey === caseRecord.idempotencyKey);
    if (duplicate) {
      if (JSON.stringify(duplicate.event) === JSON.stringify(caseRecord.event)) return duplicate;
      throw new CaseIdempotencyConflictError();
    }
    this.cases.set(caseRecord.caseId, caseRecord);
    return caseRecord;
  }
  public async get(caseId: string): Promise<PurchaseProtectionCase | undefined> { return this.cases.get(caseId); }
  public async update(caseRecord: PurchaseProtectionCase, expectedVersion: number): Promise<PurchaseProtectionCase> {
    const current = this.cases.get(caseRecord.caseId);
    if (!current || current.version !== expectedVersion) throw new CaseVersionConflictError();
    this.cases.set(caseRecord.caseId, caseRecord);
    return caseRecord;
  }
  public async listByUser(userId: string): Promise<readonly PurchaseProtectionCase[]> { return [...this.cases.values()].filter((item) => item.userId === userId); }
  public async listAll(): Promise<readonly PurchaseProtectionCase[]> { return [...this.cases.values()]; }
}

interface FileState { readonly schemaVersion: 1; readonly cases: readonly PurchaseProtectionCase[]; }

function decodeCaseState(raw: unknown): FileState {
  if (!raw || typeof raw !== 'object') throw new Error('Unsupported purchase case store schema');
  const state = raw as Partial<FileState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.cases)) throw new Error('Unsupported purchase case store schema');
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const item of state.cases) {
    if (!item || typeof item.caseId !== 'string' || !item.caseId || typeof item.userId !== 'string' || !item.userId
      || typeof item.idempotencyKey !== 'string' || !item.idempotencyKey || !Number.isInteger(item.version) || item.version < 1
      || typeof item.status !== 'string' || !item.event || typeof item.event.eventId !== 'string'
      || !Array.isArray(item.event.evidence) || !Array.isArray(item.evidence) || typeof item.marketCode !== 'string'
      || typeof item.issueType !== 'string' || typeof item.path !== 'string' || typeof item.responsibility !== 'string'
      || typeof item.riskLevel !== 'string' || !Number.isInteger(item.escalationCount) || item.escalationCount < 0
      || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || ids.has(item.caseId)) throw new Error('Invalid purchase case record');
    const key = JSON.stringify([item.userId, item.idempotencyKey]);
    if (keys.has(key)) throw new Error('Duplicate purchase case idempotency key');
    ids.add(item.caseId);
    keys.add(key);
  }
  return { schemaVersion: 1, cases: state.cases };
}

export class JsonFilePurchaseProtectionCaseRepository implements PurchaseProtectionCaseRepository {
  private readonly snapshot: JsonSnapshot<FileState>;
  public constructor(filePath: string, io?: SnapshotIO) {
    this.snapshot = new JsonSnapshot(filePath, () => ({ schemaVersion: 1, cases: [] }), decodeCaseState, io);
  }
  public create(caseRecord: PurchaseProtectionCase): Promise<PurchaseProtectionCase> {
    return this.snapshot.change(async (state) => {
      const memory = await caseMemory(state);
      const result = await memory.create(caseRecord);
      return { state: { schemaVersion: 1, cases: await memory.listAll() }, result };
    });
  }
  public get(caseId: string): Promise<PurchaseProtectionCase | undefined> {
    return this.snapshot.read(async (state) => (await caseMemory(state)).get(caseId));
  }
  public update(caseRecord: PurchaseProtectionCase, expectedVersion: number): Promise<PurchaseProtectionCase> {
    return this.snapshot.change(async (state) => {
      const memory = await caseMemory(state);
      const result = await memory.update(caseRecord, expectedVersion);
      return { state: { schemaVersion: 1, cases: await memory.listAll() }, result };
    });
  }
  public listByUser(userId: string): Promise<readonly PurchaseProtectionCase[]> {
    return this.snapshot.read(async (state) => (await caseMemory(state)).listByUser(userId));
  }
  public listAll(): Promise<readonly PurchaseProtectionCase[]> { return this.snapshot.read((state) => state.cases); }
}

async function caseMemory(state: FileState): Promise<InMemoryPurchaseProtectionCaseRepository> {
  const memory = new InMemoryPurchaseProtectionCaseRepository();
  for (const item of state.cases) await memory.create(item);
  return memory;
}

