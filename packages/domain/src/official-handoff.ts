import type { CatalogCandidate, LaunchMarketPolicy, OfficialHandoffConfirmation, SourceAuthorizationRecord, TotalCost } from '@shopping-navigation/contracts';
import { assertSourceAuthorized } from './launch-policy.js';
import { calculateTotalCost } from './total-cost.js';

export class OfficialHandoffError extends Error {
  public constructor(public readonly code: 'confirmation_required' | 'candidate_not_verified' | 'source_not_authorized' | 'invalid_official_url' | 'price_evidence_expired') {
    super(code);
    this.name = 'OfficialHandoffError';
  }
}

export interface OfficialHandoffInput {
  readonly candidate: CatalogCandidate;
  readonly totalCost: TotalCost;
  readonly quantity: number;
  readonly country: string;
  readonly currency: string;
  readonly policy: LaunchMarketPolicy;
  readonly authorization: SourceAuthorizationRecord | undefined;
  readonly officialHosts: readonly string[];
  readonly confirmed: Omit<OfficialHandoffConfirmation, 'taskId'>;
  readonly now?: Date;
}

/** Prepares a user-initiated official link; it never executes a purchase or infers affiliation. */
export function prepareOfficialHandoff(input: OfficialHandoffInput): string {
  const { candidate, confirmed, quantity, totalCost } = input;
  if (candidate.matchLevel !== 'exact' && candidate.matchLevel !== 'variant') throw new OfficialHandoffError('candidate_not_verified');
  if (!candidate.offer || candidate.offer.listingId !== candidate.listing.listingId
    || candidate.offer.sourceId !== candidate.listing.sourceId || candidate.offer.variantId !== candidate.variant.variantId) {
    throw new OfficialHandoffError('candidate_not_verified');
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || confirmed.candidateId !== candidate.candidateId
    || confirmed.variantId !== candidate.variant.variantId || confirmed.sourceId !== candidate.listing.sourceId
    || confirmed.quantity !== quantity || !confirmed.priceConditionsAccepted || !Number.isSafeInteger(confirmed.budgetMinor)
    || confirmed.budgetMinor < totalCost.totalMinor || totalCost.currency !== input.currency) {
    throw new OfficialHandoffError('confirmation_required');
  }
  if (totalCost.state === 'stale' || totalCost.state === 'unknown'
    || (input.now ?? new Date()).getTime() >= Date.parse(candidate.offer.price.expiresAt)) {
    throw new OfficialHandoffError('price_evidence_expired');
  }
  const recalculated = calculateTotalCost({ offer: candidate.offer, quantity, currency: input.currency, now: input.now ?? new Date() });
  if (recalculated.state !== 'verified' || recalculated.unknownComponents.length > 0) {
    throw new OfficialHandoffError('price_evidence_expired');
  }
  if (recalculated.totalMinor !== totalCost.totalMinor || confirmed.budgetMinor < recalculated.totalMinor) {
    throw new OfficialHandoffError('confirmation_required');
  }
  try {
    assertSourceAuthorized(input.policy, input.authorization, {
      marketCode: input.policy.marketCode, country: input.country, category: candidate.product.category,
      sourceId: candidate.listing.sourceId, purpose: 'deep_link', ...(input.now ? { now: input.now } : {}),
    });
  } catch {
    throw new OfficialHandoffError('source_not_authorized');
  }
  let url: URL;
  try { url = new URL(candidate.listing.url); }
  catch { throw new OfficialHandoffError('invalid_official_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || !input.officialHosts.some((host) => host === url.hostname)
    || input.officialHosts.length === 0 || candidate.listing.region !== input.country
    || !input.authorization?.access.includes(candidate.listing.access)) {
    throw new OfficialHandoffError('invalid_official_url');
  }
  return url.toString();
}
