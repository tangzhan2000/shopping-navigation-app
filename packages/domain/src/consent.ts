import type { ConsentPurpose, ConsentRecord } from '@shopping-navigation/contracts';

export interface ConsentRepository {
  grant(input: { userId: string; purpose: ConsentPurpose; policyVersion: string; channel: ConsentRecord['channel']; now?: string }): ConsentRecord;
  revoke(userId: string, purpose: ConsentPurpose, now?: string): ConsentRecord | undefined;
  current(userId: string, purpose: ConsentPurpose): ConsentRecord | undefined;
  list(userId: string): readonly ConsentRecord[];
}

export class InMemoryConsentRepository implements ConsentRepository {
  private readonly records = new Map<string, ConsentRecord>();
  private sequence = 0;

  public grant(input: { userId: string; purpose: ConsentPurpose; policyVersion: string; channel: ConsentRecord['channel']; now?: string }): ConsentRecord {
    const now = input.now ?? new Date().toISOString();
    const key = `${input.userId}:${input.purpose}`;
    const previous = this.records.get(key);
    const record: ConsentRecord = {
      consentId: `consent-${++this.sequence}`,
      userId: input.userId,
      purpose: input.purpose,
      policyVersion: input.policyVersion,
      state: 'granted',
      grantedAt: now,
      channel: input.channel,
      version: (previous?.version ?? 0) + 1,
    };
    this.records.set(key, record);
    return record;
  }

  public revoke(userId: string, purpose: ConsentPurpose, now = new Date().toISOString()): ConsentRecord | undefined {
    const key = `${userId}:${purpose}`;
    const previous = this.records.get(key);
    if (!previous || previous.state === 'revoked') return previous;
    const record: ConsentRecord = { ...previous, state: 'revoked', revokedAt: now, version: previous.version + 1 };
    this.records.set(key, record);
    return record;
  }

  public current(userId: string, purpose: ConsentPurpose): ConsentRecord | undefined {
    const record = this.records.get(`${userId}:${purpose}`);
    return record?.state === 'granted' ? record : undefined;
  }

  public list(userId: string): readonly ConsentRecord[] {
    return [...this.records.values()].filter((record) => record.userId === userId);
  }

  public restore(records: readonly ConsentRecord[]): void {
    this.records.clear();
    this.sequence = 0;
    for (const record of records) {
      this.records.set(`${record.userId}:${record.purpose}`, record);
      const match = /^consent-(\d+)$/u.exec(record.consentId);
      if (match) this.sequence = Math.max(this.sequence, Number(match[1]));
    }
  }

  public listAll(): readonly ConsentRecord[] {
    return [...this.records.values()];
  }
}

export function requireConsent(repository: ConsentRepository, userId: string, purpose: ConsentPurpose): ConsentRecord {
  const record = repository.current(userId, purpose);
  if (!record) throw new Error(`Consent required for ${purpose}`);
  return record;
}
