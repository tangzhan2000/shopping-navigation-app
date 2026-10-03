import type { Offer, SourceAdapter, SourceQuery } from '@shopping-navigation/contracts';

export interface SourceAdapterPolicy {
  readonly sourceId: string;
  readonly enabled: boolean;
  readonly allowedAccess: readonly SourceAdapter['access'][];
  readonly maxResults: number;
  readonly allowedSourceIds?: readonly string[];
}

export interface SourceQueryAuditRecord {
  readonly queryId: string;
  readonly sourceId: string;
  readonly status: 'available' | 'rejected' | 'failed';
  readonly reason: 'ok' | 'source_policy_rejected' | 'provider_query_failed';
  readonly resultCount: number;
}

export type SourceQueryAuditSink = (record: SourceQueryAuditRecord) => void | Promise<void>;

export class SourcePolicyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SourcePolicyError';
  }
}

export async function querySource(
  adapter: SourceAdapter,
  policy: SourceAdapterPolicy,
  query: SourceQuery,
): Promise<readonly Offer[]> {
  if (adapter.sourceId !== policy.sourceId) {
    throw new SourcePolicyError('Adapter source does not match source policy');
  }
  if (!policy.enabled) {
    throw new SourcePolicyError(`Source ${policy.sourceId} is disabled`);
  }
  if (!policy.allowedAccess.includes(adapter.access)) {
    throw new SourcePolicyError(`Access mode ${adapter.access} is not allowed`);
  }
  if (policy.allowedSourceIds !== undefined && !policy.allowedSourceIds.includes(adapter.sourceId)) {
    throw new SourcePolicyError('Source is not in the policy allowlist');
  }
  if (!query.scope.sourceIds.includes(policy.sourceId)) {
    throw new SourcePolicyError('Query source is not allowed by policy');
  }
  if (!Number.isInteger(policy.maxResults) || policy.maxResults < 1) {
    throw new SourcePolicyError('Source policy maxResults must be a positive integer');
  }
  const offers = await adapter.search(query);
  if (offers.some((offer) => offer.sourceId !== adapter.sourceId || offer.price.offerId !== offer.offerId || offer.evidenceId !== offer.price.evidenceId)) {
    throw new SourcePolicyError('Adapter returned an offer with inconsistent source evidence');
  }
  for (const offer of offers) {
    const capturedAt = Date.parse(offer.price.capturedAt);
    const expiresAt = Date.parse(offer.price.expiresAt);
    if (!Number.isFinite(capturedAt) || !Number.isFinite(expiresAt) || capturedAt > expiresAt
      || offer.price.sourceId !== offer.sourceId
      || offer.price.currency.trim() === ''
      || !Number.isSafeInteger(offer.price.displayPriceMinor) || offer.price.displayPriceMinor < 0) {
      throw new SourcePolicyError('Adapter returned malformed price evidence');
    }
    if (offer.promotionEvidence?.some((evidence) => evidence.sourceReference.split(':', 1)[0] !== offer.sourceId)) {
      throw new SourcePolicyError('Adapter returned promotion evidence for another source');
    }
  }
  return offers.slice(0, policy.maxResults);
}

export function createFixtureAdapter(input: {
  readonly sourceId: string;
  readonly offers: readonly Offer[];
  readonly access?: SourceAdapter['access'];
}): SourceAdapter {
  return {
    sourceId: input.sourceId,
    access: input.access ?? 'api',
    async search(query) {
      return input.offers.filter((offer) => {
        if (query.variantId && offer.variantId !== query.variantId) return false;
        return offer.sourceId === input.sourceId;
      });
    },
  };
}
