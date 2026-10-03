import type { CapabilityId, CapabilitySnapshot } from '@shopping-navigation/contracts';

export class MissingComparisonScopeError extends Error {
  public constructor() {
    super('A comparison scope is required to assert a lowest price');
    this.name = 'MissingComparisonScopeError';
  }
}

export function canClaimLowestPrice(input: {
  readonly matchLevel: 'exact' | 'variant' | 'substitute' | 'similar' | 'unknown';
  readonly offerCount: number;
  readonly scope?: unknown;
  readonly allRequiredTermsKnown: boolean;
}): boolean {
  return input.matchLevel === 'exact'
    && input.offerCount >= 2
    && input.scope !== undefined
    && input.allRequiredTermsKnown;
}

export function assertCanClaimLowestPrice(input: Parameters<typeof canClaimLowestPrice>[0]): void {
  if (input.scope === undefined) {
    throw new MissingComparisonScopeError();
  }
  if (!canClaimLowestPrice(input)) {
    throw new Error('The available evidence does not support a lowest-price claim');
  }
}

export function isCapabilityAvailableFor(input: {
  readonly snapshot: CapabilitySnapshot;
  readonly sourceId?: string;
  readonly country?: string;
  readonly category?: string;
}): boolean {
  const { snapshot } = input;
  if (snapshot.state !== 'available') return false;
  if (input.sourceId && !snapshot.scope.sourceIds.includes(input.sourceId)) return false;
  if (input.country && !snapshot.scope.countries.includes(input.country)) return false;
  if (input.category && !snapshot.scope.categories.includes(input.category)) return false;
  return true;
}

export function capabilityIds(): readonly CapabilityId[] {
  return [
    'F-001', 'F-002', 'F-003', 'F-004', 'F-005', 'F-006', 'F-007',
    'F-008', 'F-009', 'F-010', 'F-011', 'F-012', 'F-013', 'F-014',
    'F-015', 'F-016', 'F-017', 'F-018', 'F-019',
  ];
}
