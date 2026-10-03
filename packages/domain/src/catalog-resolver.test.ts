import { describe, expect, it } from 'vitest';
import { createFixtureCatalogResolver, type FixtureCatalogEntry } from './catalog-resolver.js';

const entry: FixtureCatalogEntry = {
  product: { productId: 'p1', brand: 'Fixture', title: '无香洗衣液 2L', category: 'general', attributes: { volume: '2L' }, evidenceIds: ['product-evidence'] },
  variant: { variantId: 'v1', productId: 'p1', attributes: { volume: '2L' }, identifiers: {} },
  listing: { listingId: 'l1', sourceId: 'fixture-shop-a', variantId: 'v1', url: 'https://fixture.example/p/v1', access: 'api', region: 'CN', capturedAt: '2026-10-01T00:00:00.000Z' },
  requiredAttributes: ['volume'], exactQueries: ['无香洗衣液 2L'],
};
const request = { taskId: 't1', query: '无香洗衣液 2L', country: 'CN', currency: 'CNY', quantity: 1 };

describe('fixture catalog resolver', () => {
  it('returns exact evidence-backed match only for explicit fixture query', () => {
    const result = createFixtureCatalogResolver([entry]).resolve(request);
    expect(result.candidates[0]).toMatchObject({ candidateId: 'v1', matchLevel: 'exact', evidenceIds: ['product-evidence'] });
  });

  it('keeps ambiguous substring queries unknown without an offer', () => {
    const result = createFixtureCatalogResolver([entry]).resolve({ ...request, query: '洗衣液' });
    expect(result.candidates[0]?.matchLevel).toBe('unknown');
    expect(result.candidates[0]?.offer).toBeUndefined();
  });

  it('returns an empty result when source is filtered out', () => {
    expect(createFixtureCatalogResolver([entry]).resolve({ ...request, sourceIds: ['other-shop'] }).candidates).toEqual([]);
  });

  it('rejects invalid quantity and unsupported market', () => {
    const resolver = createFixtureCatalogResolver([entry]);
    expect(() => resolver.resolve({ ...request, quantity: 0 })).toThrow();
    expect(() => resolver.resolve({ ...request, currency: 'USD' })).toThrow();
  });
});
