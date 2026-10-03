import { describe, expect, it } from 'vitest';
import { InMemoryCapabilityRegistry, InvalidCapabilityTransitionError } from './capability-registry.js';
import { assertCanClaimLowestPrice, canClaimLowestPrice, capabilityIds, isCapabilityAvailableFor } from './invariants.js';

describe('capability registry', () => {
  it('starts every target capability in designing state', () => {
    const registry = new InMemoryCapabilityRegistry(capabilityIds());
    expect(registry.get('F-001')?.state).toBe('designing');
    expect(registry.get('F-019')?.state).toBe('designing');
  });

  it('requires an explicit valid state transition', () => {
    const registry = new InMemoryCapabilityRegistry(['F-014']);
    const snapshot = registry.transition({
      capabilityId: 'F-014',
      to: 'awaiting_platform_authorization',
      reason: 'Source contract is not signed',
      actorId: 'admin-1',
      now: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(snapshot.state).toBe('awaiting_platform_authorization');
    expect(snapshot.reason).toContain('not signed');
    expect(() => registry.transition({
      capabilityId: 'F-014',
      to: 'designing',
      reason: 'attempted bypass',
      actorId: 'admin-1',
    })).toThrow(InvalidCapabilityTransitionError);
  });

  it('allows authorized scoped capability use only', () => {
    const registry = new InMemoryCapabilityRegistry(['F-008']);
    registry.addEvidence({ evidenceId: 'auth-source-a', capabilityId: 'F-008', kind: 'authorization', reference: 'contract://source-a', version: '1', recordedAt: '2026-10-01T00:00:00.000Z', recordedBy: 'admin-1' });
    registry.transition({
      capabilityId: 'F-008',
      to: 'available',
      reason: 'Source coverage approved',
      actorId: 'admin-1',
      scope: { sourceIds: ['source-a'], countries: ['CN'], categories: ['cleaning'] },
    });
    const snapshot = registry.get('F-008');
    expect(snapshot).toBeDefined();
    expect(isCapabilityAvailableFor({ snapshot: snapshot!, sourceId: 'source-a', country: 'CN', category: 'cleaning' })).toBe(true);
    expect(isCapabilityAvailableFor({ snapshot: snapshot!, sourceId: 'source-b', country: 'CN', category: 'cleaning' })).toBe(false);
  });
});

describe('fact invariants', () => {
  it('does not allow lowest-price claims without exact evidence and scope', () => {
    expect(canClaimLowestPrice({ matchLevel: 'similar', offerCount: 2, scope: {}, allRequiredTermsKnown: true })).toBe(false);
    expect(canClaimLowestPrice({ matchLevel: 'exact', offerCount: 2, allRequiredTermsKnown: true })).toBe(false);
    expect(canClaimLowestPrice({ matchLevel: 'exact', offerCount: 2, scope: {}, allRequiredTermsKnown: false })).toBe(false);
    expect(canClaimLowestPrice({ matchLevel: 'exact', offerCount: 2, scope: {}, allRequiredTermsKnown: true })).toBe(true);
    expect(() => assertCanClaimLowestPrice({ matchLevel: 'exact', offerCount: 1, allRequiredTermsKnown: true })).toThrow('comparison scope');
  });
});
