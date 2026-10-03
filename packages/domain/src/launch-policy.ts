import type {
  LaunchMarketPolicy,
  SourceAuthorizationRecord,
  SourcePurpose,
} from '@shopping-navigation/contracts';

import { isLaunchPolicyEffective } from './launch-policy-repository.js';

export class LaunchPolicyError extends Error {
  public constructor(public readonly code: 'market_not_allowed' | 'source_not_authorized' | 'purpose_not_allowed' | 'category_not_allowed') {
    super(code);
    this.name = 'LaunchPolicyError';
  }
}

export interface SourceQueryScope {
  readonly marketCode: string;
  readonly country: string;
  readonly category: string;
  readonly sourceId: string;
  readonly purpose: SourcePurpose;
  readonly now?: Date;
}

export function assertSourceAuthorized(
  policy: LaunchMarketPolicy,
  authorization: SourceAuthorizationRecord | undefined,
  query: SourceQueryScope,
): void {
  if (!isLaunchPolicyEffective(policy, query.now ?? new Date()) || query.marketCode !== policy.marketCode || !policy.allowedCountries.includes(query.country)) {
    throw new LaunchPolicyError('market_not_allowed');
  }
  if (!policy.allowedCategories.includes(query.category)) {
    throw new LaunchPolicyError('category_not_allowed');
  }
  if (!policy.sourceAllowlist.includes(query.sourceId) || !authorization || !policy.authorizationIds.includes(authorization.authorizationId)) {
    throw new LaunchPolicyError('source_not_authorized');
  }
  if (authorization.sourceId !== query.sourceId) {
    throw new LaunchPolicyError('source_not_authorized');
  }
  const now = query.now ?? new Date();
  const effectiveAt = Date.parse(authorization.effectiveAt);
  const expiresAt = authorization.expiresAt ? Date.parse(authorization.expiresAt) : Number.POSITIVE_INFINITY;
  const revokedAt = authorization.revokedAt ? Date.parse(authorization.revokedAt) : Number.POSITIVE_INFINITY;
  if (authorization.state !== 'active' || !Number.isFinite(effectiveAt) || Number.isNaN(expiresAt) || Number.isNaN(revokedAt)
    || now.getTime() < effectiveAt || now.getTime() >= expiresAt || now.getTime() >= revokedAt) {
    throw new LaunchPolicyError('source_not_authorized');
  }
  if (!authorization.countries.includes(query.country) || !authorization.categories.includes(query.category)) {
    throw new LaunchPolicyError('source_not_authorized');
  }
  if (!authorization.purposes.includes(query.purpose)) {
    throw new LaunchPolicyError('purpose_not_allowed');
  }
}

export function isUserImport(sourceId: string, access: string): boolean {
  return sourceId === 'user_import' || access === 'user_import';
}
