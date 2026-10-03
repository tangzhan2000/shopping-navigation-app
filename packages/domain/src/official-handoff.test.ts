import { describe, expect, it } from 'vitest';
import type { CatalogCandidate, LaunchMarketPolicy, SourceAuthorizationRecord, TotalCost } from '@shopping-navigation/contracts';
import { OfficialHandoffError, prepareOfficialHandoff, type OfficialHandoffInput } from './official-handoff.js';

const now = new Date('2026-10-01T00:05:00.000Z');
const policy: LaunchMarketPolicy = {
  policyId: 'test', version: '1', marketCode: 'CN', jurisdiction: 'CN', currency: 'CNY', timezone: 'Asia/Shanghai',
  deliveryDestinationGranularity: 'country', taxRegime: 'included', allowedCountries: ['CN'], allowedCategories: ['general'],
  sourceAllowlist: ['fixture-shop-a'], authorizationIds: ['fixture-auth'], status: 'active',
};
const authorization: SourceAuthorizationRecord = {
  authorizationId: 'fixture-auth', sourceId: 'fixture-shop-a', state: 'active', authorizedBy: 'test',
  purposes: ['search', 'deep_link'], fields: ['price'], access: ['api'], countries: ['CN'], categories: ['general'],
  cacheAllowed: false, redisplayAllowed: true, effectiveAt: '2026-01-01T00:00:00.000Z', evidenceReference: 'test',
};
const candidate: CatalogCandidate = {
  candidateId: 'variant-a', product: { productId: 'product-a', title: 'Fixture', category: 'general', attributes: {}, evidenceIds: ['catalog'] },
  variant: { variantId: 'variant-a', productId: 'product-a', attributes: {}, identifiers: {} },
  listing: { listingId: 'listing-a', sourceId: 'fixture-shop-a', variantId: 'variant-a', url: 'https://fixture.example/item', access: 'api', region: 'CN', capturedAt: now.toISOString() },
  matchLevel: 'exact', reasons: [], missingAttributes: [], evidenceIds: ['catalog'], priceState: 'verified',
  offer: { offerId: 'offer-a', listingId: 'listing-a', variantId: 'variant-a', sourceId: 'fixture-shop-a', evidenceId: 'price-a',
    price: { evidenceId: 'price-a', offerId: 'offer-a', sourceId: 'fixture-shop-a', capturedAt: now.toISOString(), expiresAt: '2026-10-01T00:10:00.000Z', priceState: 'verified', currency: 'CNY', displayPriceMinor: 100, shippingMinor: 0, taxMinor: 0, discountMinor: 0, sourceReference: 'test', ruleVersion: '1' }, availability: 'in_stock', promotionIds: [] },
};
const totalCost: TotalCost = { currency: 'CNY', itemMinor: 100, shippingMinor: 0, taxMinor: 0, discountMinor: 0, totalMinor: 100, state: 'verified', unknownComponents: [] };
const input: OfficialHandoffInput = {
  candidate, totalCost, quantity: 1, country: 'CN', currency: 'CNY', policy, authorization, officialHosts: ['fixture.example'], now,
  confirmed: { candidateId: 'variant-a', variantId: 'variant-a', sourceId: 'fixture-shop-a', quantity: 1, budgetMinor: 100, priceConditionsAccepted: true },
};

function rejects(changes: Partial<OfficialHandoffInput>, code: OfficialHandoffError['code']): void {
  expect(() => prepareOfficialHandoff({ ...input, ...changes })).toThrowError(OfficialHandoffError);
  try { prepareOfficialHandoff({ ...input, ...changes }); }
  catch (error) { expect((error as OfficialHandoffError).code).toBe(code); }
}

describe('official handoff preparation', () => {
  it('returns an allowlisted HTTPS URL only after complete confirmation', () => {
    expect(prepareOfficialHandoff(input)).toBe('https://fixture.example/item');
  });
  it('rejects mismatched quantity, product, source, budget and conditions', () => {
    rejects({ confirmed: { ...input.confirmed, quantity: 2 } }, 'confirmation_required');
    rejects({ confirmed: { ...input.confirmed, candidateId: 'other' } }, 'confirmation_required');
    rejects({ confirmed: { ...input.confirmed, sourceId: 'other' } }, 'confirmation_required');
    rejects({ confirmed: { ...input.confirmed, budgetMinor: 99 } }, 'confirmation_required');
    rejects({ confirmed: { ...input.confirmed, priceConditionsAccepted: false } }, 'confirmation_required');
  });
  it('rejects unverified candidates, stale evidence and revoked authorization', () => {
    rejects({ candidate: { ...candidate, matchLevel: 'similar' } }, 'candidate_not_verified');
    rejects({ totalCost: { ...totalCost, state: 'unknown' } }, 'price_evidence_expired');
    rejects({ now: new Date('2026-10-01T00:11:00.000Z') }, 'price_evidence_expired');
    rejects({ totalCost: { ...totalCost, totalMinor: 1 } }, 'confirmation_required');
    rejects({ candidate: { ...candidate, offer: { ...candidate.offer!, price: (({ discountMinor: _discountMinor, ...price }) => price)(candidate.offer!.price) } } }, 'price_evidence_expired');
    rejects({ authorization: { ...authorization, state: 'revoked' } }, 'source_not_authorized');
    rejects({ authorization: { ...authorization, purposes: ['search'] } }, 'source_not_authorized');
  });
  it('rejects unsafe or non-allowlisted destinations without suffix matching', () => {
    for (const url of ['http://fixture.example/item', 'https://fixture.example.evil.test/item', 'https://user@fixture.example/item', 'https://fixture.example:8443/item']) {
      rejects({ candidate: { ...candidate, listing: { ...candidate.listing, url } } }, 'invalid_official_url');
    }
    rejects({ officialHosts: [] }, 'invalid_official_url');
  });
});
