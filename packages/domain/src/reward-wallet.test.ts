import { describe, expect, it, vi } from 'vitest';
import type { CapabilitySnapshot, RewardEntitlement } from '@shopping-navigation/contracts';
import {
  AppendOnlyWalletLedger,
  applyRewardEvent,
  createPayoutRequest,
  createRewardEntitlement,
  InMemoryRewardEventProcessor,
  RewardDomainError,
  submitPayout,
} from './reward-wallet.js';

const now = new Date('2026-10-01T00:00:00.000Z');
function entitlement(overrides: Partial<RewardEntitlement> = {}): RewardEntitlement {
  return createRewardEntitlement({
    entitlementId: 'reward-1', userId: 'user-1', attributionId: 'attr-1', currency: 'CNY', amountMinor: 1000,
    status: 'return_window', ruleVersion: 'rule-v1', evidenceIds: ['evidence-1'], idempotencyKey: 'reward-create-1', now,
    ...overrides,
  });
}
const capability = (state: CapabilitySnapshot['state'], capabilityId: CapabilitySnapshot['capabilityId'] = 'F-018'): CapabilitySnapshot => ({
  capabilityId, state, scope: { sourceIds: [], countries: [], categories: [] }, updatedAt: now.toISOString(), updatedBy: 'test',
});

describe('reward entitlement and wallet', () => {
  it('moves a confirmed reward to available and appends a single credit for duplicate event delivery', () => {
    const ledger = new AppendOnlyWalletLedger();
    const processor = new InMemoryRewardEventProcessor(ledger);
    const event = { eventId: 'event-confirm-1', eventType: 'commission.confirmed' as const, entitlementId: 'reward-1', occurredAt: now.toISOString() };
    const first = processor.process({ entitlement: entitlement(), event, accountId: 'user-1', entryId: 'ledger-1', now });
    const replay = processor.process({ entitlement: entitlement(), event, accountId: 'user-1', entryId: 'ledger-duplicate', now });
    expect(first.entitlement.status).toBe('user_available');
    expect(first.applied).toBe(true);
    expect(replay.applied).toBe(false);
    expect(ledger.entries()).toHaveLength(1);
    expect(ledger.balance('user-1')).toBe(1000);
  });

  it('records partial refunds as reversals and closes the entitlement after a full refund', () => {
    const base = entitlement({ status: 'user_available' });
    const partiallyRefunded = applyRewardEvent(base, {
      eventId: 'refund-1', eventType: 'refund.recorded', entitlementId: 'reward-1', occurredAt: now.toISOString(), payload: { amountMinor: 400 },
    }, now);
    expect(partiallyRefunded).toMatchObject({ status: 'partially_refunded', refundedMinor: 400, amountMinor: 1000 });
    const fullyRefunded = applyRewardEvent(partiallyRefunded, {
      eventId: 'refund-2', eventType: 'refund.recorded', entitlementId: 'reward-1', occurredAt: now.toISOString(), payload: { amountMinor: 600 },
    }, now);
    expect(fullyRefunded).toMatchObject({ status: 'refunded', refundedMinor: 1000 });
    expect(() => applyRewardEvent(fullyRefunded, {
      eventId: 'refund-3', eventType: 'refund.recorded', entitlementId: 'reward-1', occurredAt: now.toISOString(), payload: { amountMinor: 1 },
    }, now)).toThrow(RewardDomainError);
  });

  it('replays an individual refund only once into the append-only ledger', () => {
    const ledger = new AppendOnlyWalletLedger();
    const processor = new InMemoryRewardEventProcessor(ledger);
    const event = { eventId: 'refund-event-1', eventType: 'refund.recorded' as const, entitlementId: 'reward-1', occurredAt: now.toISOString(), payload: { amountMinor: 250 } };
    processor.process({ entitlement: entitlement({ status: 'user_available' }), event, accountId: 'user-1', entryId: 'ledger-refund-1', now });
    processor.process({ entitlement: entitlement({ status: 'user_available' }), event, accountId: 'user-1', entryId: 'ledger-refund-replay', now });
    expect(ledger.entries()).toHaveLength(1);
    expect(ledger.balance('user-1')).toBe(-250);
    expect(ledger.entries()[0]?.entryType).toBe('reversal');
  });

  it('does not permit entry mutation or payout without the F-018 compliance capability', () => {
    const ledger = new AppendOnlyWalletLedger();
    ledger.append({ entryId: 'entry-1', accountId: 'user-1', currency: 'CNY', amountMinor: 500, entryType: 'credit', idempotencyKey: 'entry-key-1', sourceEventId: 'event-1', createdAt: now.toISOString() });
    const before = ledger.entries();
    expect(() => { (ledger as unknown as { allEntries: unknown[] }).allEntries.push({}); }).toThrow();
    expect(ledger.entries()).toEqual(before);
    const args = { capability: capability('awaiting_compliance_approval'), payoutId: 'payout-1', accountId: 'user-1', currency: 'CNY', amountMinor: 500, idempotencyKey: 'payout-key-1', now };
    expect(() => createPayoutRequest(args)).toThrow(RewardDomainError);
    const request = createPayoutRequest({ ...args, capability: capability('available') });
    expect(request.status).toBe('pending');
  });

  it('keeps payment execution behind the provider interface', async () => {
    const provider = { submit: vi.fn(async () => ({ providerReference: 'provider-ref-1' })) };
    const request = createPayoutRequest({ capability: capability('available'), payoutId: 'payout-1', accountId: 'user-1', currency: 'CNY', amountMinor: 500, idempotencyKey: 'payout-key-1', now });
    await expect(submitPayout(provider, request)).resolves.toMatchObject({ providerReference: 'provider-ref-1' });
    expect(provider.submit).toHaveBeenCalledOnce();
  });
});
