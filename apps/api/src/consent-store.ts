import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { ConsentPurpose, ConsentRecord } from '@shopping-navigation/contracts';
import { InMemoryConsentRepository, type ConsentRepository } from '@shopping-navigation/domain';

interface ConsentFileState {
  readonly schemaVersion: 1;
  readonly records: readonly ConsentRecord[];
}

function isConsentRecord(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ConsentRecord>;
  return typeof record.consentId === 'string' && !!record.consentId
    && typeof record.userId === 'string' && !!record.userId
    && ['recognition', 'personalization', 'notifications', 'source_access', 'orders', 'rewards'].includes(record.purpose ?? '')
    && typeof record.policyVersion === 'string' && !!record.policyVersion
    && (record.state === 'granted' || record.state === 'revoked')
    && typeof record.grantedAt === 'string' && (record.revokedAt === undefined || typeof record.revokedAt === 'string')
    && ['app', 'web', 'system_import', 'admin'].includes(record.channel ?? '')
    && Number.isInteger(record.version) && (record.version ?? 0) > 0;
}

export class JsonFileConsentRepository implements ConsentRepository {
  private readonly repository = new InMemoryConsentRepository();
  private initialized = false;

  public constructor(private readonly filePath: string) {}

  public grant(input: { userId: string; purpose: ConsentPurpose; policyVersion: string; channel: ConsentRecord['channel']; now?: string }): ConsentRecord {
    this.initialize();
    const lockFd = this.acquireLock();
    try {
      this.reload();
      const record = this.repository.grant(input);
      this.persist(lockFd);
      return record;
    } finally {
      this.releaseLock(lockFd);
    }
  }

  public revoke(userId: string, purpose: ConsentPurpose, now?: string): ConsentRecord | undefined {
    this.initialize();
    const lockFd = this.acquireLock();
    try {
      this.reload();
      const record = this.repository.revoke(userId, purpose, now);
      if (record) this.persist(lockFd);
      return record;
    } finally {
      this.releaseLock(lockFd);
    }
  }

  public current(userId: string, purpose: ConsentPurpose): ConsentRecord | undefined {
    this.initialize();
    this.reload();
    return this.repository.current(userId, purpose);
  }

  public list(userId: string): readonly ConsentRecord[] {
    this.initialize();
    this.reload();
    return this.repository.list(userId);
  }

  private initialize(): void {
    if (this.initialized) return;
    try {
      const directory = dirname(this.filePath);
      const parent = statSync(directory);
      if (!parent.isDirectory() || (parent.mode & 0o022) !== 0) throw new Error('Unsafe consent store directory permissions');
      const file = statSync(this.filePath);
      if (!file.isFile() || (file.mode & 0o777) !== 0o600) throw new Error('Unsafe consent store permissions');
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ConsentFileState>;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isConsentRecord)) throw new Error('Unsupported consent store schema');
      this.repository.restore(parsed.records);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.initialized = true;
  }

  private reload(): void {
    try {
      const directory = dirname(this.filePath);
      const parent = statSync(directory);
      if (!parent.isDirectory() || (parent.mode & 0o022) !== 0) throw new Error('Unsafe consent store directory permissions');
      const file = statSync(this.filePath);
      if (!file.isFile() || (file.mode & 0o777) !== 0o600) throw new Error('Unsafe consent store permissions');
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ConsentFileState>;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isConsentRecord)) throw new Error('Unsupported consent store schema');
      this.repository.restore(parsed.records);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.repository.restore([]);
    }
  }

  private acquireLock(): number {
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const lockPath = `${this.filePath}.lock`;
    const lockDeadline = Date.now() + 2_000;
    while (true) {
      try { return openSync(lockPath, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= lockDeadline) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    }
  }

  private releaseLock(lockFd: number): void {
    closeSync(lockFd);
    try { unlinkSync(`${this.filePath}.lock`); } catch { /* best effort cleanup */ }
  }

  private persist(lockFd: number): void {
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const temporary = join(directory, `.${basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`);
    let renamed = false;
    try {
      writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, records: this.repository.listAll() }, null, 2), { encoding: 'utf8', mode: 0o600 });
      chmodSync(temporary, 0o600);
      const temporaryFd = openSync(temporary, 'r+');
      try { fsyncSync(temporaryFd); } finally { closeSync(temporaryFd); }
      renameSync(temporary, this.filePath);
      renamed = true;
      chmodSync(this.filePath, 0o600);
      const directoryFd = openSync(directory, 'r');
      try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
    } finally {
      if (!renamed) { try { unlinkSync(temporary); } catch { /* best effort cleanup */ } }
    }
  }
}
