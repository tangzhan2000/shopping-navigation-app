import { describe, expect, it } from 'vitest';
import { InMemoryConsentRepository, requireConsent } from './consent.js';
import { buildClarificationState } from './clarification.js';
import { createUserImport, isImportExpired } from './import.js';
import { evaluateExecutionPolicy } from './execution-policy.js';

describe('engineering capability foundations', () => {
  it('grants and revokes consent fail closed', () => {
    const repository = new InMemoryConsentRepository();
    expect(() => requireConsent(repository, 'user-1', 'recognition')).toThrow('Consent required');
    repository.grant({ userId: 'user-1', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    expect(requireConsent(repository, 'user-1', 'recognition').state).toBe('granted');
    repository.revoke('user-1', 'recognition', '2026-01-01T00:00:00.000Z');
    expect(repository.current('user-1', 'recognition')).toBeUndefined();
  });

  it('creates bounded imports and expires them', () => {
    const record = createUserImport({ userId: 'user-1', kind: 'share', content: 'https://example.test/item', now: '2026-01-01T00:00:00.000Z', ttlMs: 1000 });
    expect(record.sha256).toHaveLength(64);
    expect(isImportExpired(record, new Date('2026-01-01T00:00:01.000Z'))).toBe(true);
    expect(() => createUserImport({ userId: 'user-1', kind: 'image', content: 'x', mediaType: 'application/octet-stream' })).toThrow('media type');
  });

  it('asks only for missing required fields', () => {
    const state = buildClarificationState('task-1', [
      { name: 'query', value: 'coffee', confidence: 0.9, confirmedByUser: false },
      { name: 'quantity', value: '', confidence: 0.1, confirmedByUser: false },
    ]);
    expect(state.completed).toBe(false);
    expect(state.unknownFields).toEqual(['quantity']);
    expect(state.questions[0]?.informationGain).toBe(1);
  });

  it('keeps automatic purchase unavailable even when input looks valid', () => {
    const decision = evaluateExecutionPolicy({ capabilityId: 'F-019', userConfirmed: true, sourceAllowlisted: true, categoryLowRisk: true, budgetMinor: 100, amountMinor: 50, cooldownElapsed: true, idempotencyKey: 'request-1' });
    expect(decision).toEqual({ allowed: false, reason: 'capability_unavailable', auditRequired: true });
  });
});
