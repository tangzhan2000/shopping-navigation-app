import { describe, expect, it } from 'vitest';
import { createApiHandler } from './index.js';
import { createTestFetch } from './test-http.js';
import { InMemoryPurchaseProtectionCaseRepository } from './purchase-store.js';

let principalUser: string | undefined = 'user-1';
const request = createTestFetch(createApiHandler({
  caseRepository: new InMemoryPurchaseProtectionCaseRepository(),
  principalResolver: () => principalUser ? { userId: principalUser } : undefined,
}));
const origin = 'http://test.local';

const payload = (idempotencyKey = 'case-request-1') => ({
  userId: 'user-1', marketCode: 'CN', sourceId: 'fixture-shop-a', idempotencyKey,
  path: 'merchant_after_sales', responsibility: 'merchant', riskLevel: 'medium',
  event: { eventId: `event-${idempotencyKey}`, issueType: 'delivery_delay', detectedAt: '2026-06-01T00:00:00.000Z', evidence: [{ evidenceId: 'proof-1', sourceType: 'user_import', reference: 'upload://proof', capturedAt: '2026-06-01T00:00:00.000Z', freshness: 'current' }] },
});

describe('purchase protection API', () => {
  it('exposes launch policy and creates/transitions a case', async () => {
    const policy = await request(`${origin}/v1/launch-policy`);
    expect((await policy.json() as { data: { sourceAllowlist: string[] } }).data.sourceAllowlist).toEqual(['fixture-shop-a']);
    const created = await request(`${origin}/v1/purchase-protection-cases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) });
    expect(created.status).toBe(201);
    const record = (await created.json() as { data: { caseId: string; status: string } }).data;
    expect(record.status).toBe('detected');
    const action = await request(`${origin}/v1/purchase-protection-cases/${record.caseId}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_user_action' }) });
    expect(action.status).toBe(200);
    expect((await action.json() as { data: { status: string } }).data.status).toBe('needs_user_action');
  });

  it('rejects unauthenticated and cross-user access', async () => {
    principalUser = undefined;
    const unauthenticated = await request(`${origin}/v1/purchase-protection-cases?userId=user-1`);
    expect(unauthenticated.status).toBe(401);

    principalUser = 'user-1';
    const created = await request(`${origin}/v1/purchase-protection-cases`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload('ownership-check'), userId: 'attacker' }),
    });
    const record = (await created.json() as { data: { caseId: string; userId: string } }).data;
    expect(record.userId).toBe('user-1');

    principalUser = 'user-2';
    const crossUserRead = await request(`${origin}/v1/purchase-protection-cases/${record.caseId}`);
    expect(crossUserRead.status).toBe(403);
    const crossUserList = await request(`${origin}/v1/purchase-protection-cases?userId=user-1`);
    expect(crossUserList.status).toBe(403);
  });
  it('preserves platform responsibility when the case path is valid', async () => {
    principalUser = 'user-1';
    const response = await request(`${origin}/v1/purchase-protection-cases`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload('platform-responsibility'), responsibility: 'platform' }),
    });
    expect(response.status).toBe(201);
    expect((await response.json() as { data: { responsibility: string; path: string } }).data)
      .toMatchObject({ responsibility: 'platform', path: 'merchant_after_sales' });
  });

  it('rejects an allowlist-outside source', async () => {
    principalUser = 'user-1';
    const response = await request(`${origin}/v1/purchase-protection-cases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload('outside'), sourceId: 'unknown-shop' }) });
    expect(response.status).toBe(403);
  });
});

