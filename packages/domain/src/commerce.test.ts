import { describe, expect, it, vi } from 'vitest';
import type { Offer, SourceQuery } from '@shopping-navigation/contracts';
import { calculateTotalCost, CurrencyMismatchError } from './total-cost.js';
import { createFixtureAdapter, querySource, SourcePolicyError } from './source-adapter.js';

const scope = { country: 'CN', currency: 'CNY', quantity: 1, sourceIds: ['shop-a'], memberStatus: 'non_member' as const };
const offer = (overrides: Partial<Offer> = {}): Offer => ({
  offerId: 'offer-1',
  listingId: 'listing-1',
  variantId: 'variant-1',
  sourceId: 'shop-a',
  evidenceId: 'evidence-1',
  price: {
    evidenceId: 'evidence-1',
    offerId: 'offer-1',
    sourceId: 'shop-a',
    capturedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-10-01T00:10:00.000Z',
    priceState: 'verified',
    currency: 'CNY',
    displayPriceMinor: 10000,
    shippingMinor: 500,
    taxMinor: 0,
    sourceReference: 'fixture:shop-a/offer-1',
    ruleVersion: 'v1',
  },
  availability: 'in_stock',
  promotionIds: [],
  ...overrides,
});

describe('total cost', () => {
  it('calculates known components with integer minor units', () => {
    const result = calculateTotalCost({ offer: offer(), quantity: 2, currency: 'CNY' });
    expect(result).toMatchObject({ itemMinor: 20000, shippingMinor: 500, taxMinor: 0, totalMinor: 20500, state: 'unknown' });
    expect(result.unknownComponents).toContain('discount');
  });

  it('keeps unknown shipping and tax unknown instead of assuming zero', () => {
    const unknown = offer({
      price: {
        evidenceId: 'evidence-1',
        offerId: 'offer-1',
        sourceId: 'shop-a',
        capturedAt: '2026-10-01T00:00:00.000Z',
        expiresAt: '2026-10-01T00:10:00.000Z',
        priceState: 'verified',
        currency: 'CNY',
        displayPriceMinor: 10000,
        sourceReference: 'fixture:shop-a/offer-1',
        ruleVersion: 'v1',
      },
    });
    const result = calculateTotalCost({ offer: unknown, quantity: 1, currency: 'CNY' });
    expect(result.totalMinor).toBe(10000);
    expect(result.state).toBe('unknown');
    expect(result.unknownComponents).toEqual(['shipping', 'tax', 'discount']);
  });

  it('marks expired evidence stale and applies known discounts', () => {
    const result = calculateTotalCost({ offer: offer({ price: { ...offer().price, discountMinor: 1000 } }), quantity: 1, currency: 'CNY', now: new Date('2026-10-01T00:20:00.000Z') });
    expect(result.totalMinor).toBe(9500);
    expect(result.state).toBe('stale');
    expect(result.unknownComponents).toEqual([]);
  });
  it('rejects mixed currencies and invalid quantities', () => {
    expect(() => calculateTotalCost({ offer: offer(), quantity: 1, currency: 'USD' })).toThrow(CurrencyMismatchError);
    expect(() => calculateTotalCost({ offer: offer(), quantity: 0, currency: 'CNY' })).toThrow('positive integer');
  });
});

describe('source adapter policy', () => {
  const query: SourceQuery = { queryId: 'query-1', scope, variantId: 'variant-1' };

  it('only calls an enabled adapter with an allowed access mode and bounds results', async () => {
    const adapter = createFixtureAdapter({ sourceId: 'shop-a', offers: [offer(), offer({ offerId: 'offer-2', evidenceId: 'evidence-2', price: { ...offer().price, offerId: 'offer-2', evidenceId: 'evidence-2' } })] });
    const results = await querySource(adapter, {
      sourceId: 'shop-a', enabled: true, allowedAccess: ['api'], maxResults: 1,
    }, query);
    expect(results).toHaveLength(1);
  });

  it('does not invoke a disabled or mismatched source', async () => {
    const search = vi.fn(async () => [offer()]);
    const adapter = { sourceId: 'shop-a', access: 'api' as const, search };
    await expect(querySource(adapter, {
      sourceId: 'shop-a', enabled: false, allowedAccess: ['api'], maxResults: 10,
    }, query)).rejects.toThrow(SourcePolicyError);
    expect(search).not.toHaveBeenCalled();
    await expect(querySource(adapter, {
      sourceId: 'shop-b', enabled: true, allowedAccess: ['api'], maxResults: 10,
    }, query)).rejects.toThrow(SourcePolicyError);
  });
});
