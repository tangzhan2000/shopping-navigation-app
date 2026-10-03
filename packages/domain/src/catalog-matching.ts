import type { CanonicalProduct, MatchLevel, ProductVariant } from '@shopping-navigation/contracts';

export interface MatchEvidence {
  readonly level: MatchLevel;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly missingAttributes: readonly string[];
}

export function classifyVariantMatch(input: {
  readonly requested: ProductVariant;
  readonly candidate: ProductVariant;
  readonly requiredAttributes: readonly string[];
}): MatchEvidence {
  if (input.requiredAttributes.length === 0) {
    return { level: 'unknown', score: 0, reasons: ['Required variant attributes are not defined'], missingAttributes: [] };
  }
  if (input.requested.productId !== input.candidate.productId) {
    return { level: 'unknown', score: 0, reasons: ['Canonical product identity differs'], missingAttributes: [...input.requiredAttributes] };
  }
  const missing = input.requiredAttributes.filter((key) => !normalize(input.requested.attributes[key] ?? '') || !normalize(input.candidate.attributes[key] ?? ''));
  if (missing.length > 0) return { level: 'unknown', score: 0, reasons: ['Required variant attributes are incomplete'], missingAttributes: missing };
  const differences = input.requiredAttributes.filter((key) => normalize(input.requested.attributes[key] ?? '') !== normalize(input.candidate.attributes[key] ?? ''));
  if (differences.length === 0) return { level: 'exact', score: 1, reasons: ['All required variant attributes match'], missingAttributes: [] };
  return { level: 'variant', score: Math.max(0, 1 - differences.length / input.requiredAttributes.length), reasons: differences.map((key) => `${key} differs`), missingAttributes: [] };
}

export function validateCanonicalProduct(product: CanonicalProduct): void {
  if (!product.productId.trim() || !product.title.trim() || !product.category.trim()) throw new Error('Canonical product identity fields are required');
  if (Object.values(product.attributes).some((value) => !value.trim())) throw new Error('Canonical attributes must be normalized non-empty strings');
  if (product.evidenceIds.length === 0) throw new Error('Canonical product facts require evidence');
}

function normalize(value: string): string { return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' '); }
