import { beforeEach, describe, expect, it } from 'vitest';
import { createApiHandler } from './index.js';
import { createTestFetch } from './test-http.js';
import { InMemoryConsentRepository } from '@shopping-navigation/domain';
import { fixtureLaunchPolicy } from './fixture-policy.js';

let consentRepository: InMemoryConsentRepository;
let request: ReturnType<typeof createTestFetch>;
const origin = 'http://test.local';

beforeEach(() => {
  consentRepository = new InMemoryConsentRepository();
  request = createTestFetch(createApiHandler({ principalResolver: () => ({ userId: 'test-user' }), consentRepository }));
});

describe('API routes', () => {
  it('allows configured CORS origins and rejects unknown preflight origins', async () => {
    const allowed = await request(`${origin}/v1/consents`, { method: 'OPTIONS', headers: { origin } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(origin);
    expect(allowed.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    const rejected = await request(`${origin}/v1/consents`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    expect(rejected.status).toBe(403);
  });

  it('stores and revokes consent for the authenticated user only', async () => {
    const created = await request(`${origin}/v1/consents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'recognition', policyVersion: 'v1', channel: 'app' }) });
    expect(created.status).toBe(201);
    expect((await created.json() as { data: { userId: string; state: string } }).data).toMatchObject({ userId: 'test-user', state: 'granted' });
    const revoked = await request(`${origin}/v1/consents`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'recognition' }) });
    expect((await revoked.json() as { data: { state: string } }).data.state).toBe('revoked');
  });

  it('denies recognition and comparison without consent and after revocation', async () => {
    const recognition = await request(`${origin}/v1/recognition-tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputType: 'text', content: '洗衣液' }),
    });
    expect(recognition.status).toBe(403);
    expect((await recognition.json() as { error: { code: string } }).error.code).toBe('consent_required');

    const comparison = await request(`${origin}/v1/compare?taskId=missing&candidateId=missing`);
    expect(comparison.status).toBe(403);

    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    consentRepository.revoke('test-user', 'recognition');
    const revoked = await request(`${origin}/v1/recognition-tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputType: 'text', content: '洗衣液' }),
    });
    expect(revoked.status).toBe(403);
  });

  it('never permits automatic purchase execution', async () => {
    const response = await request(`${origin}/v1/execution-policy/evaluate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userConfirmed: true, sourceAllowlisted: true, categoryLowRisk: true, budgetMinor: 1000, amountMinor: 100, cooldownElapsed: true, idempotencyKey: 'request-1' }),
    });
    expect(response.status).toBe(200);
    expect((await response.json() as { data: { allowed: boolean; reason: string } }).data).toMatchObject({ allowed: false, reason: 'capability_unavailable' });
  });

  it('requires authentication for consent and execution policy routes', async () => {
    const unauthenticatedRequest = createTestFetch(createApiHandler());
    const consent = await unauthenticatedRequest(`${origin}/v1/consents`);
    const execution = await unauthenticatedRequest(`${origin}/v1/execution-policy/evaluate`, { method: 'POST' });
    expect(consent.status).toBe(401);
    expect(execution.status).toBe(401);
  });
  it('returns health and the complete capability registry', async () => {
    const health = await request(`${origin}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });

    const response = await request(`${origin}/v1/capabilities`);
    const payload = await response.json() as { data: unknown[] };
    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(19);
  });

  it('creates, reads, confirms and deletes a recognition task', async () => {
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    const createdResponse = await request(`${origin}/v1/recognition-tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: 'api-task-1', inputType: 'text', content: '需要 2 件无香洗衣液' }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { data: { status: string; fields: { name: string; value: string }[] } };
    expect(created.data.status).toBe('needs_confirmation');
    expect(created.data.fields.find((field) => field.name === 'quantity')?.value).toBe('2');

    const confirmedResponse = await request(`${origin}/v1/recognition-tasks/api-task-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    });
    expect((await confirmedResponse.json() as { data: { status: string } }).data.status).toBe('confirmed');

    const deletedResponse = await request(`${origin}/v1/recognition-tasks/api-task-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    });
    expect((await deletedResponse.json() as { data: { status: string } }).data.status).toBe('deleted');
  });

  it('rejects unauthenticated recognition access and isolates task ownership', async () => {
    const unauthenticatedRequest = createTestFetch(createApiHandler());
    const unauthenticated = await unauthenticatedRequest(`${origin}/v1/recognition-tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: 'unauthenticated-task', inputType: 'text', content: 'hello' }),
    });
    expect(unauthenticated.status).toBe(401);

    const crossUserConsent = new InMemoryConsentRepository();
    crossUserConsent.grant({ userId: 'owner', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    crossUserConsent.grant({ userId: 'other', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    const crossUserRequest = createTestFetch(createApiHandler({ consentRepository: crossUserConsent, principalResolver: (request) => request.headers['x-user-id'] === 'owner' ? { userId: 'owner' } : { userId: 'other' } }));
    const created = await crossUserRequest(`${origin}/v1/recognition-tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'owner' },
      body: JSON.stringify({ taskId: 'owned-task', inputType: 'text', content: 'hello' }),
    });
    expect(created.status).toBe(201);
    const forbidden = await crossUserRequest(`${origin}/v1/recognition-tasks/owned-task`, { headers: { 'x-user-id': 'other' } });
    expect(forbidden.status).toBe(404);
  });
  it('resolves only fully confirmed owned recognition tasks and keeps unknown queries non-comparable', async () => {
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    const created = await request(`${origin}/v1/recognition-tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputType: 'text', content: '无香洗衣液 2L' }) });
    const task = (await created.json() as { data: { taskId: string; fields: { name: string; value: string }[] } }).data;
    const resolve = async (extra: Record<string, unknown> = {}) => request(`${origin}/v1/catalog/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: task.taskId, country: 'CN', currency: 'CNY', ...extra }) });
    expect((await resolve()).status).toBe(409);

    await request(`${origin}/v1/recognition-tasks/${task.taskId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm', confirmedFields: task.fields.map((field) => field.name), fieldValues: Object.fromEntries(task.fields.map((field) => [field.name, field.value])) }) });
    const exact = await resolve({ query: '伪造的精确商品' });
    expect(exact.status).toBe(200);
    expect((await exact.json() as { data: { candidates: { matchLevel: string }[] } }).data.candidates[0]?.matchLevel).toBe('exact');

    const ambiguousCreated = await request(`${origin}/v1/recognition-tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputType: 'text', content: '洗衣液' }) });
    const ambiguousTask = (await ambiguousCreated.json() as { data: { taskId: string; fields: { name: string; value: string }[] } }).data;
    await request(`${origin}/v1/recognition-tasks/${ambiguousTask.taskId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm', confirmedFields: ambiguousTask.fields.map((field) => field.name), fieldValues: Object.fromEntries(ambiguousTask.fields.map((field) => [field.name, field.value])) }) });
    const unknown = await resolve({ taskId: ambiguousTask.taskId });
    expect((await unknown.json() as { data: { candidates: { matchLevel: string; offer?: unknown }[] } }).data.candidates[0]).toMatchObject({ matchLevel: 'unknown' });
  });

  it('returns 400 for invalid catalog resolution input', async () => {
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    const response = await request(`${origin}/v1/catalog/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'missing', country: 'CN', currency: 'CNY' }) });
    expect(response.status).toBe(409);
  });

  it('requires a confirmed owned candidate for comparison', async () => {
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    const rejected = await request(`${origin}/v1/compare?variantId=fixture-variant&quantity=2`);
    expect(rejected.status).toBe(400);
    expect((await rejected.json() as { error: { code: string } }).error.code).toBe('confirmed_candidate_required');

    const createdResponse = await request(`${origin}/v1/recognition-tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: 'compare-task-1', inputType: 'text', content: 'fixture' }),
    });
    const created = (await createdResponse.json() as { data: { taskId: string; fields: { name: string; value: string }[] } }).data;
    await request(`${origin}/v1/recognition-tasks/${created.taskId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', confirmedFields: created.fields.map((field) => field.name), fieldValues: Object.fromEntries(created.fields.map((field) => [field.name, field.value])) }),
    });
    const resolved = await request(`${origin}/v1/catalog/resolve`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: created.taskId, query: 'fixture', country: 'CN', currency: 'CNY', quantity: 2 }),
    });
    const candidates = (await resolved.json() as { data: { candidates: { candidateId: string; matchLevel: string }[] } }).data.candidates;
    const exact = candidates.find((candidate) => candidate.matchLevel === 'exact');
    expect(exact).toBeDefined();
    const comparison = await request(`${origin}/v1/compare?taskId=${created.taskId}&candidateId=${exact!.candidateId}&quantity=1`);
    expect(comparison.status).toBe(200);
  });

  it('replays a fixture journey without opening an official link, recording an order or enabling payout', async () => {
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    const post = (path: string, body: Record<string, unknown>) => request(`${origin}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const created = await post('/v1/recognition-tasks', { inputType: 'text', content: 'fixture' });
    expect(created.status).toBe(201);
    const task = (await created.json() as { data: { taskId: string; fields: { name: string; value: string }[] } }).data;
    const early = await post('/v1/outbound/prepare', { taskId: task.taskId, candidateId: 'fixture-variant', variantId: 'fixture-variant', sourceId: 'fixture-shop-a', quantity: 1, budgetMinor: 10500, priceConditionsAccepted: true });
    expect(early.status).toBe(409);
    await post(`/v1/recognition-tasks/${task.taskId}`, { action: 'confirm', confirmedFields: task.fields.map((field) => field.name), fieldValues: Object.fromEntries(task.fields.map((field) => [field.name, field.value])) });
    const resolved = await post('/v1/catalog/resolve', { taskId: task.taskId, country: 'CN', currency: 'CNY' });
    const candidate = (await resolved.json() as { data: { candidates: { candidateId: string; variant: { variantId: string }; listing: { sourceId: string } }[] } }).data.candidates[0]!;
    const comparison = await request(`${origin}/v1/compare?taskId=${task.taskId}&candidateId=${candidate.candidateId}&quantity=1`);
    expect(comparison.status).toBe(200);
    const cost = (await comparison.json() as { data: { results: { totalCost: { totalMinor: number; state: string } }[] } }).data.results[0]!.totalCost;
    expect(cost).toMatchObject({ totalMinor: 10500, state: 'verified' });
    const confirmation = { taskId: task.taskId, candidateId: candidate.candidateId, variantId: candidate.variant.variantId, sourceId: candidate.listing.sourceId, quantity: 1, budgetMinor: cost.totalMinor, priceConditionsAccepted: true };
    expect((await post('/v1/outbound/prepare', { ...confirmation, quantity: 2 })).status).toBe(409);
    expect((await post('/v1/outbound/prepare', { ...confirmation, budgetMinor: 10000 })).status).toBe(409);
    const prepared = await post('/v1/outbound/prepare', confirmation);
    expect(prepared.status).toBe(200);
    const data = (await prepared.json() as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ state: 'sandbox_only', candidateId: candidate.candidateId, quantity: 1 });
    expect(data).not.toHaveProperty('officialUrl');
    expect(data).not.toHaveProperty('orderId');
    expect((await request(`${origin}/v1/orders`)).status).toBe(503);
    expect((await post('/v1/payouts', { amountMinor: 100 })).status).toBe(503);
  });

  it('fails closed for absent order, reminder and recommendation providers and irreversible actions', async () => {
    for (const [path, capabilityId] of [['/v1/orders', 'F-016'], ['/v1/recommendations', 'F-010'], ['/v1/reminders', 'F-015']] as const) {
      const response = await request(`${origin}${path}`);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: 'capability_unavailable' }, capability: { capabilityId } });
    }
    for (const [path, capabilityId] of [['/v1/payouts', 'F-018'], ['/v1/purchases/execute', 'F-019']] as const) {
      const response = await request(`${origin}${path}`, { method: 'POST' });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: 'capability_unavailable' }, capability: { capabilityId, state: 'awaiting_compliance_approval' } });
      expect((await createTestFetch(createApiHandler())(`${origin}${path}`, { method: 'POST' })).status).toBe(401);
    }
  });

  it('serves the configured policy and fails closed without one', async () => {
    const configured = await request(`${origin}/v1/launch-policy`);
    expect(configured.status).toBe(200);
    expect(await configured.json()).toMatchObject({ data: { policyId: fixtureLaunchPolicy.policyId, status: 'active' } });

    const absent = createTestFetch(createApiHandler({ policyReader: { current: async () => undefined } }));
    const unavailable = await absent(`${origin}/v1/launch-policy`);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: { code: 'launch_policy_unconfigured' } });

    const broken = createTestFetch(createApiHandler({ policyReader: { current: async () => { throw new Error('private-policy-path'); } } }));
    const failed = await broken(`${origin}/v1/launch-policy`);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain('private-policy-path');
  });

  it('rejects case creation outside the configured policy', async () => {
    const scoped = createTestFetch(createApiHandler({
      principalResolver: () => ({ userId: 'test-user' }),
      policyReader: { current: async () => undefined },
    }));
    const response = await scoped(`${origin}/v1/purchase-protection-cases`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        marketCode: 'CN', sourceId: 'fixture-shop-a', idempotencyKey: 'no-policy', path: 'merchant_after_sales',
        responsibility: 'merchant', riskLevel: 'medium',
        event: { eventId: 'event-1', issueType: 'delivery_delay', detectedAt: '2026-10-01T00:00:00.000Z', evidence: [] },
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'source_not_authorized' } });
  });

  it('never exposes fixture handoff in production mode', async () => {
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const response = await request(`${origin}/v1/outbound/prepare`, { method: 'POST' });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: 'official_handoff_unavailable' } });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('keeps handoff fail-closed across authentication, consent and revocation', async () => {
    const body = { taskId: 'missing', candidateId: 'fixture-variant', variantId: 'fixture-variant', sourceId: 'fixture-shop-a', quantity: 1, budgetMinor: 10500, priceConditionsAccepted: true };
    const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    expect((await createTestFetch(createApiHandler())(`${origin}/v1/outbound/prepare`, options)).status).toBe(401);
    expect((await request(`${origin}/v1/outbound/prepare`, options)).status).toBe(403);
    consentRepository.grant({ userId: 'test-user', purpose: 'recognition', policyVersion: 'v1', channel: 'app' });
    consentRepository.grant({ userId: 'test-user', purpose: 'source_access', policyVersion: 'v1', channel: 'app' });
    consentRepository.revoke('test-user', 'source_access');
    expect((await request(`${origin}/v1/outbound/prepare`, options)).status).toBe(403);
  });

});
