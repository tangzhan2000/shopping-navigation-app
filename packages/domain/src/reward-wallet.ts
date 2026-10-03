import type {
  CapabilitySnapshot,
  PayoutProvider,
  PayoutRequest,
  RewardEntitlement,
  RewardEvent,
  RewardLedgerEntry,
  RewardEntitlementStatus,
} from '@shopping-navigation/contracts';

export class RewardDomainError extends Error {
  public constructor(public readonly code:
    | 'invalid_entitlement'
    | 'invalid_transition'
    | 'duplicate_event'
    | 'invalid_refund'
    | 'insufficient_funds'
    | 'payout_blocked'
    | 'invalid_amount'
    | 'idempotency_conflict') {
    super(code);
    this.name = 'RewardDomainError';
  }
}

const TERMINAL: readonly RewardEntitlementStatus[] = ['paid', 'expired', 'cancelled', 'refunded', 'reversed'];

export function createRewardEntitlement(input: Omit<RewardEntitlement, 'refundedMinor' | 'version' | 'createdAt' | 'updatedAt'> & {
  readonly now?: Date;
}): RewardEntitlement {
  if (!input.entitlementId || !input.userId || !input.attributionId || !input.currency || !input.ruleVersion || !input.idempotencyKey) {
    throw new RewardDomainError('invalid_entitlement');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new RewardDomainError('invalid_amount');
  const now = (input.now ?? new Date()).toISOString();
  return { ...input, refundedMinor: 0, version: 1, createdAt: now, updatedAt: now };
}

function transitionStatus(status: RewardEntitlementStatus, eventType: RewardEvent['eventType']): RewardEntitlementStatus {
  if (eventType === 'reward.frozen') return 'frozen';
  if (eventType === 'reward.unfrozen') {
    if (status !== 'frozen') throw new RewardDomainError('invalid_transition');
    return 'user_available';
  }
  const next: Partial<Record<RewardEvent['eventType'], readonly RewardEntitlementStatus[]>> = {
    'attribution.tracked': ['not_detected'],
    'attribution.failed': ['not_detected', 'tracked', 'merchant_pending', 'return_window'],
    'order.matched': ['tracked'],
    'commission.pending': ['merchant_pending'],
    'commission.confirmed': ['return_window'],
    'order.cancelled': ['tracked', 'merchant_pending', 'return_window', 'commission_confirmed', 'user_available'],
    'reward.disputed': ['user_available', 'partially_refunded', 'refunded', 'reversed'],
    'payout.requested': ['user_available'],
    'payout.paid': ['payout_pending'],
    'payout.failed': ['payout_pending'],
  };
  if (eventType === 'refund.recorded') return status;
  if (!next[eventType]?.includes(status)) throw new RewardDomainError('invalid_transition');
  const target: Partial<Record<RewardEvent['eventType'], RewardEntitlementStatus>> = {
    'attribution.tracked': 'tracked',
    'attribution.failed': 'attribution_failed',
    'order.matched': 'merchant_pending',
    'commission.pending': 'return_window',
    'commission.confirmed': 'user_available',
    'order.cancelled': 'cancelled',
    'reward.disputed': 'disputed',
    'payout.requested': 'payout_pending',
    'payout.paid': 'paid',
    'payout.failed': 'payout_failed',
  };
  return target[eventType] as RewardEntitlementStatus;
}

export function applyRewardEvent(current: RewardEntitlement, event: RewardEvent, now = new Date()): RewardEntitlement {
  if (current.entitlementId !== event.entitlementId) throw new RewardDomainError('invalid_entitlement');
  if (TERMINAL.includes(current.status) && event.eventType !== 'refund.recorded') throw new RewardDomainError('invalid_transition');
  let status = transitionStatus(current.status, event.eventType);
  let refundedMinor = current.refundedMinor;
  if (event.eventType === 'refund.recorded') {
    const amount = event.payload?.amountMinor;
    if (!Number.isSafeInteger(amount) || amount === undefined || amount <= 0 || refundedMinor + amount > current.amountMinor) {
      throw new RewardDomainError('invalid_refund');
    }
    refundedMinor += amount;
    status = refundedMinor === current.amountMinor ? 'refunded' : 'partially_refunded';
  }
  return { ...current, status, refundedMinor, updatedAt: now.toISOString(), version: current.version + 1 };
}

export class AppendOnlyWalletLedger {
  readonly #allEntries: RewardLedgerEntry[] = [];
  readonly #byIdempotency = new Map<string, RewardLedgerEntry>();

  public append(entry: RewardLedgerEntry): RewardLedgerEntry {
    if (!entry.entryId || !entry.accountId || !entry.currency || !entry.sourceEventId || !entry.idempotencyKey) {
      throw new RewardDomainError('invalid_entitlement');
    }
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) throw new RewardDomainError('invalid_amount');
    const existing = this.#byIdempotency.get(entry.idempotencyKey);
    if (existing) {
      const sameRequest = existing.accountId === entry.accountId
        && existing.entitlementId === entry.entitlementId
        && existing.currency === entry.currency
        && existing.amountMinor === entry.amountMinor
        && existing.entryType === entry.entryType
        && existing.sourceEventId === entry.sourceEventId;
      if (!sameRequest) throw new RewardDomainError('idempotency_conflict');
      return existing;
    }
    const stored = Object.freeze({ ...entry });
    this.#allEntries.push(stored);
    this.#byIdempotency.set(entry.idempotencyKey, stored);
    return stored;
  }

  public entries(accountId?: string): readonly RewardLedgerEntry[] {
    return this.#allEntries.filter((entry) => accountId === undefined || entry.accountId === accountId);
  }

  public balance(accountId: string): number {
    return this.entries(accountId).reduce((balance, entry) => {
      if (entry.entryType === 'credit' || entry.entryType === 'unfreeze') return balance + entry.amountMinor;
      return balance - entry.amountMinor;
    }, 0);
  }
}

export interface ProcessedRewardEvent {
  readonly event: RewardEvent;
  readonly entitlement: RewardEntitlement;
  readonly applied: boolean;
  readonly ledgerEntries: readonly RewardLedgerEntry[];
}

export class InMemoryRewardEventProcessor {
  private readonly processed = new Map<string, ProcessedRewardEvent>();

  public constructor(private readonly ledger: AppendOnlyWalletLedger) {}

  public process(input: { readonly entitlement: RewardEntitlement; readonly event: RewardEvent; readonly accountId: string; readonly entryId: string; readonly now?: Date }): ProcessedRewardEvent {
    if (input.accountId !== input.entitlement.userId) throw new RewardDomainError('invalid_entitlement');
    const previous = this.processed.get(input.event.eventId);
    if (previous) return { ...previous, applied: false };
    const entitlement = applyRewardEvent(input.entitlement, input.event, input.now);
    const ledgerEntries: RewardLedgerEntry[] = [];
    const amount = input.event.payload?.amountMinor;
    if (input.event.eventType === 'commission.confirmed' && input.entitlement.amountMinor > 0) {
      ledgerEntries.push(this.ledger.append({ entryId: input.entryId, accountId: input.accountId, entitlementId: entitlement.entitlementId, currency: entitlement.currency, amountMinor: entitlement.amountMinor, entryType: 'credit', idempotencyKey: `event:${input.event.eventId}`, sourceEventId: input.event.eventId, createdAt: (input.now ?? new Date()).toISOString() }));
    } else if (input.event.eventType === 'refund.recorded' && amount !== undefined) {
      ledgerEntries.push(this.ledger.append({ entryId: input.entryId, accountId: input.accountId, entitlementId: entitlement.entitlementId, currency: entitlement.currency, amountMinor: amount, entryType: 'reversal', idempotencyKey: `event:${input.event.eventId}`, sourceEventId: input.event.eventId, createdAt: (input.now ?? new Date()).toISOString() }));
    }
    const result = { event: input.event, entitlement, applied: true, ledgerEntries };
    this.processed.set(input.event.eventId, result);
    return result;
  }
}

export function assertPayoutCapability(capability: CapabilitySnapshot): void {
  if (capability.capabilityId !== 'F-018' || capability.state !== 'available') throw new RewardDomainError('payout_blocked');
}

export function createPayoutRequest(input: {
  readonly capability: CapabilitySnapshot;
  readonly payoutId: string;
  readonly accountId: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
  readonly now?: Date;
}): PayoutRequest {
  assertPayoutCapability(input.capability);
  if (!input.payoutId.trim() || !input.accountId.trim() || !input.currency.trim() || !input.idempotencyKey.trim()) {
    throw new RewardDomainError('invalid_entitlement');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new RewardDomainError('invalid_amount');
  return { payoutId: input.payoutId, accountId: input.accountId, currency: input.currency, amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey, status: 'pending', createdAt: (input.now ?? new Date()).toISOString() };
}

export async function submitPayout(provider: PayoutProvider, request: PayoutRequest): Promise<{ readonly request: PayoutRequest; readonly providerReference: string }> {
  const result = await provider.submit(request);
  return { request, providerReference: result.providerReference };
}
