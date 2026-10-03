import { describe, expect, it } from 'vitest';
import { assertSourceAuthorized, LaunchPolicyError } from './launch-policy.js';
import { createProtectionCase, evaluateProtectionDeadline, ProtectionCaseError, transitionProtectionCase } from './purchase-protection.js';
import type { LaunchMarketPolicy, SourceAuthorizationRecord } from '@shopping-navigation/contracts';

const policy: LaunchMarketPolicy = {
  policyId: 'policy-1', version: '1', marketCode: 'CN', jurisdiction: 'CN', currency: 'CNY', timezone: 'Asia/Shanghai',
  deliveryDestinationGranularity: 'country', taxRegime: 'included', allowedCountries: ['CN'], allowedCategories: ['general'],
  sourceAllowlist: ['shop-a'], authorizationIds: ['auth-1'], status: 'active',
};
const auth: SourceAuthorizationRecord = {
  authorizationId: 'auth-1', sourceId: 'shop-a', state: 'active', authorizedBy: 'contract-1', purposes: ['search'], fields: ['price'], access: ['api'],
  countries: ['CN'], categories: ['general'], cacheAllowed: false, redisplayAllowed: true,
  effectiveAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z', evidenceReference: 'evidence://1',
};
const now = new Date('2026-06-01T00:00:00.000Z');
const created = () => createProtectionCase({ caseId: 'case-1', userId: 'user-1', marketCode: 'CN', path: 'merchant_after_sales', responsibility: 'merchant', riskLevel: 'medium', event: { eventId: 'event-1', issueType: 'delivery_delay', detectedAt: now.toISOString(), evidence: [{ evidenceId: 'e1', sourceType: 'user_import', reference: 'upload://1', capturedAt: now.toISOString(), freshness: 'current' }] }, idempotencyKey: 'idempotency-1', now });

describe('launch policy', () => {
  it('allows an active source within its exact market scope', () => {
    expect(() => assertSourceAuthorized(policy, auth, { marketCode: 'CN', country: 'CN', category: 'general', sourceId: 'shop-a', purpose: 'search', now })).not.toThrow();
  });
  it('rejects revoked authorization and user imports as platform sources', () => {
    expect(() => assertSourceAuthorized(policy, { ...auth, state: 'revoked' }, { marketCode: 'CN', country: 'CN', category: 'general', sourceId: 'shop-a', purpose: 'search', now })).toThrow(LaunchPolicyError);
    expect(() => assertSourceAuthorized(policy, auth, { marketCode: 'CN', country: 'CN', category: 'general', sourceId: 'user_import', purpose: 'search', now })).toThrow(LaunchPolicyError);
  });
});

describe('purchase protection case', () => {
  it('rejects resolution without evidence and resurrection of terminal cases', () => {
    const initial = created();
    const needsAction = transitionProtectionCase(initial, { status: 'needs_user_action', now });
    expect(() => transitionProtectionCase(needsAction, { status: 'resolved', now })).toThrow(ProtectionCaseError);
    const dismissed = transitionProtectionCase(needsAction, { status: 'dismissed', now });
    expect(() => transitionProtectionCase(dismissed, { status: 'needs_user_action', now })).toThrow(ProtectionCaseError);
  });

  it('evaluates an SLA deadline at the exact boundary', () => {
    const initial = created();
    const dueAt = new Date('2026-10-03T01:00:00.000Z');
    const before = evaluateProtectionDeadline(initial, new Date('2026-10-02T23:59:59.999Z'));
    const at = evaluateProtectionDeadline({ ...initial, deadlineAt: dueAt.toISOString() }, dueAt);
    expect(before).toMatchObject({ due: false, action: 'none' });
    expect(at).toMatchObject({ due: true, action: 'escalate' });
  });

  it('does not escalate terminal cases or cases already escalated for the same deadline', () => {
    const initial = { ...created(), deadlineAt: '2026-10-03T01:00:00.000Z', escalationCount: 1 };
    expect(evaluateProtectionDeadline(initial, new Date('2026-10-03T02:00:00.000Z'))).toMatchObject({ due: true, action: 'none' });
    expect(evaluateProtectionDeadline({ ...initial, status: 'resolved' }, new Date('2026-10-03T02:00:00.000Z'))).toMatchObject({ due: false, action: 'none' });
  });
});
