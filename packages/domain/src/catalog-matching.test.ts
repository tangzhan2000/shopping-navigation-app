import { describe, expect, it } from 'vitest';
import type { ProductVariant } from '@shopping-navigation/contracts';
import { classifyVariantMatch, validateCanonicalProduct } from './catalog-matching.js';

const product = { productId: 'detergent-a', title: 'Laundry liquid', category: 'household', attributes: { scent: 'unscented' }, evidenceIds: ['synthetic-fixture-evidence'] };
const variant = (attributes: Record<string, string>): ProductVariant => ({ variantId: 'candidate', productId: product.productId, attributes, identifiers: {} });

describe('catalog matching', () => {
  it('classifies exact variants only when required attributes are complete and equal', () => {
    const requested = variant({ volume: '2L', scent: 'unscented' });
    const result = classifyVariantMatch({ requested, candidate: variant({ volume: ' 2L ', scent: 'UNSCENTED' }), requiredAttributes: ['volume', 'scent'] });
    expect(result.level).toBe('exact');
  });

  it('classifies a different variant of the same product without calling it exact', () => {
    const requested = variant({ volume: '2L', scent: 'unscented' });
    const result = classifyVariantMatch({ requested, candidate: variant({ volume: '1L', scent: 'unscented' }), requiredAttributes: ['volume', 'scent'] });
    expect(result.level).toBe('variant');
  });

  it('keeps missing attributes and empty requirements unknown', () => {
    const requested = variant({ volume: '2L', scent: 'unscented' });
    expect(classifyVariantMatch({ requested, candidate: variant({ volume: '', scent: 'unscented' }), requiredAttributes: ['volume', 'scent'] }).level).toBe('unknown');
    expect(classifyVariantMatch({ requested, candidate: requested, requiredAttributes: [] }).level).toBe('unknown');
  });

  it('does not match across canonical products', () => {
    const requested = variant({ volume: '2L', scent: 'unscented' });
    const other = { ...requested, productId: 'other-product' };
    expect(classifyVariantMatch({ requested, candidate: other, requiredAttributes: ['volume', 'scent'] }).level).toBe('unknown');
  });

  it('validates catalog evidence before a product can be treated as canonical', () => {
    expect(() => validateCanonicalProduct({ ...product, evidenceIds: [] })).toThrow(/evidence/u);
  });
});
