import { describe, expect, it, vi } from 'vitest';
import type { Offer, PriceEvidence } from '@shopping-navigation/contracts';
import { createFixtureAdapter, querySource, SourcePolicyError } from './source-adapter.js';
import {
  PRIORITY_SOURCE_IDS,
  defaultUnavailableProviders,
  querySources,
  unavailableProvider,
} from './source-orchestration.js';

const price = (offerId: string, sourceId: string): PriceEvidence => ({
  evidenceId: `evidence-${offerId}`,
  offerId,
  sourceId,
  capturedAt: '2026-10-02T00:00:00.000Z',
  expiresAt: '2026-10-03T00:00:00.000Z',
  priceState: 'verified',
  currency: 'CNY',
  displayPriceMinor: 100,
  sourceReference: `${sourceId}:offer:${offerId}`,
  ruleVersion: 'test-v1',
});

const offer = (offerId: string, sourceId: string, subsidy = false): Offer => ({
  offerId,
  listingId: `listing-${offerId}`,
  variantId: 'variant-1',
  sourceId,
  evidenceId: `evidence-${offerId}`,
  price: price(offerId, sourceId),
  availability: 'in_stock',
  promotionIds: subsidy ? [`promotion-${offerId}`] : [],
  ...(subsidy ? {
    promotionEvidence: [{
      promotionId: `promotion-${offerId}`,
      kind: 'subsidy' as const,
      label: '百亿补贴',
      capturedAt: '2026-10-02T00:00:00.000Z',
      expiresAt: '2026-10-03T00:00:00.000Z',
      sourceReference: `${sourceId}:promotion:${offerId}`,
      verified: true,
    }],
  } : {}),
});

const query = {
  queryId: 'query-1',
  scope: { country: 'CN', currency: 'CNY', quantity: 1, sourceIds: [PRIORITY_SOURCE_IDS.taobaoAlliance, PRIORITY_SOURCE_IDS.pinduoduoDuoduoJinbao], memberStatus: 'unknown' as const },
};

const policy = {
  sourceId: 'fixture-a', enabled: true, allowedAccess: ['api' as const], maxResults: 10,
};

describe('multi-source provider orchestration', () => {
  it('keeps unauthorized priority providers unavailable', async () => {
    const result = await querySources({
      providers: defaultUnavailableProviders,
      policies: [],
      query,
      now: new Date('2026-10-02T12:00:00.000Z'),
    });
    expect(result.offers).toEqual([]);
    expect(result.results.map(({ sourceId, status }) => ({ sourceId, status }))).toEqual([
      { sourceId: PRIORITY_SOURCE_IDS.taobaoAlliance, status: 'unavailable' },
      { sourceId: PRIORITY_SOURCE_IDS.pinduoduoDuoduoJinbao, status: 'unavailable' },
    ]);
  });

  it('prioritizes only provider-verified, currently valid subsidy evidence', async () => {
    const adapter = createFixtureAdapter({
      sourceId: 'fixture-a',
      offers: [offer('regular', 'fixture-a'), offer('subsidized', 'fixture-a', true)],
    });
    const result = await querySources({
      providers: [{ sourceId: 'fixture-a', availability: 'available', adapter, reason: 'fixture_only' }],
      policies: [policy],
      query: { ...query, scope: { ...query.scope, sourceIds: ['fixture-a'] } },
      now: new Date('2026-10-02T12:00:00.000Z'),
    });
    expect(result.offers.map(({ offerId }) => offerId)).toEqual(['subsidized', 'regular']);
  });

  it('rejects a query whose source scope excludes the authorized adapter', async () => {
    const search = vi.fn(async () => [offer('scoped', 'fixture-a')]);
    const adapter = { sourceId: 'fixture-a', access: 'api' as const, search };
    await expect(querySource(adapter, {
      sourceId: 'fixture-a', enabled: true, allowedAccess: ['api'], maxResults: 10,
    }, { ...query, scope: { ...query.scope, sourceIds: ['fixture-b'] } })).rejects.toThrow(SourcePolicyError);
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects invalid policy limits and malformed evidence', async () => {
    const adapter = { sourceId: 'fixture-a', access: 'api' as const, search: vi.fn(async () => [offer('valid', 'fixture-a')]) };
    await expect(querySource(adapter, {
      sourceId: 'fixture-a', enabled: true, allowedAccess: ['api'], maxResults: 0,
    }, { ...query, scope: { ...query.scope, sourceIds: ['fixture-a'] } })).rejects.toThrow(SourcePolicyError);
    expect(adapter.search).not.toHaveBeenCalled();

    const malformedOffers: Offer[] = [
      { ...offer('wrong-evidence', 'fixture-a'), evidenceId: 'different-evidence' },
      { ...offer('wrong-offer', 'fixture-a'), price: { ...offer('wrong-offer', 'fixture-a').price, offerId: 'different-offer' } },
      { ...offer('wrong-time', 'fixture-a'), price: { ...offer('wrong-time', 'fixture-a').price, capturedAt: '2026-10-04T00:00:00.000Z', expiresAt: '2026-10-03T00:00:00.000Z' } },
      { ...offer('cross-promotion', 'fixture-a'), promotionEvidence: [{
        promotionId: 'promotion-cross', kind: 'subsidy', capturedAt: '2026-10-02T00:00:00.000Z',
        expiresAt: '2026-10-03T00:00:00.000Z', sourceReference: 'fixture-b:promotion:cross', verified: true,
      }] },
    ];
    for (const malformed of malformedOffers) {
      const invalidAdapter = { sourceId: 'fixture-a', access: 'api' as const, search: vi.fn(async () => [malformed]) };
      await expect(querySource(invalidAdapter, {
        sourceId: 'fixture-a', enabled: true, allowedAccess: ['api'], maxResults: 10,
      }, { ...query, scope: { ...query.scope, sourceIds: ['fixture-a'] } })).rejects.toThrow(SourcePolicyError);
    }
  });

  it('emits metadata-only audit records for every participating provider', async () => {
    const audit: unknown[] = [];
    const result = await querySources({
      providers: [
        unavailableProvider('fixture-paused', 'operator_paused'),
        { sourceId: 'fixture-a', availability: 'available', adapter: createFixtureAdapter({ sourceId: 'fixture-a', offers: [offer('available', 'fixture-a')] }), reason: 'fixture_only' },
        { sourceId: 'fixture-failing', availability: 'available', adapter: { sourceId: 'fixture-failing', access: 'api' as const, async search() { throw new Error('secret upstream token'); } }, reason: 'fixture_only' },
      ],
      policies: [{ ...policy, sourceId: 'fixture-a' }, { ...policy, sourceId: 'fixture-failing' }],
      query: { ...query, scope: { ...query.scope, sourceIds: ['fixture-paused', 'fixture-a', 'fixture-failing'] } },
      audit: (record) => { audit.push(record); },
    });
    expect(result.results.map(({ sourceId, status }) => ({ sourceId, status }))).toEqual([
      { sourceId: 'fixture-paused', status: 'unavailable' },
      { sourceId: 'fixture-a', status: 'available' },
      { sourceId: 'fixture-failing', status: 'failed' },
    ]);
    expect(audit).toHaveLength(3);
    for (const record of audit) {
      expect(record).toEqual(expect.objectContaining({ queryId: 'query-1', sourceId: expect.any(String), status: expect.any(String), reason: expect.any(String), resultCount: expect.any(Number) }));
      expect(Object.keys(record as object).sort()).toEqual(['queryId', 'reason', 'resultCount', 'sourceId', 'status']);
      expect(JSON.stringify(record)).not.toContain('secret upstream token');
    }
  });
});

