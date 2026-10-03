import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryConsentRepository } from '@shopping-navigation/domain';
import { createApiServer } from './index.js';
import { JsonFileRecognitionTaskStore } from './recognition-store.js';
import { CaseVersionConflictError, InMemoryPurchaseProtectionCaseRepository, JsonFilePurchaseProtectionCaseRepository, type PurchaseProtectionCaseRepository } from './purchase-store.js';
import type { RecognitionTaskStoreLike } from './recognition-store.js';
import { startTestServer, type TestServerHandle } from './test-http.js';

const headers = (userId = 'owner'): HeadersInit => ({ 'content-type': 'application/json', 'x-user-id': userId });
const post = (body: unknown, userId = 'owner'): RequestInit => ({ method: 'POST', headers: headers(userId), body: JSON.stringify(body) });
const casePayload = (idempotencyKey: string, eventId = 'delivery-event') => ({
  marketCode: 'CN', sourceId: 'fixture-shop-a', idempotencyKey,
  path: 'merchant_after_sales', responsibility: 'merchant', riskLevel: 'medium',
  event: { eventId, issueType: 'delivery_delay', detectedAt: '2026-06-01T00:00:00.000Z', evidence: [{ evidenceId: 'proof-1', sourceType: 'user_import', reference: 'upload://proof', capturedAt: '2026-06-01T00:00:00.000Z', freshness: 'current' }] },
});

async function withApi(run: (context: {
  start(overrides?: { recognitionTasks?: RecognitionTaskStoreLike; caseRepository?: PurchaseProtectionCaseRepository }): Promise<TestServerHandle>;
  consent: InMemoryConsentRepository;
}) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'api-http-'));
  const consent = new InMemoryConsentRepository();
  const servers: TestServerHandle[] = [];
  const start = async (overrides: { recognitionTasks?: RecognitionTaskStoreLike; caseRepository?: PurchaseProtectionCaseRepository } = {}): Promise<TestServerHandle> => {
    const server = createApiServer({
      principalResolver: (request) => {
        const userId = request.headers['x-user-id'];
        return typeof userId === 'string' && ['owner', 'other'].includes(userId) ? { userId } : undefined;
      },
      consentRepository: consent,
      recognitionTasks: overrides.recognitionTasks ?? new JsonFileRecognitionTaskStore(join(directory, 'recognition.json')),
      caseRepository: overrides.caseRepository ?? new JsonFilePurchaseProtectionCaseRepository(join(directory, 'cases.json')),
    });
    const handle = await startTestServer(server);
    servers.push(handle);
    return handle;
  };
  try { await run({ start, consent }); }
  finally {
    try { for (const server of servers.reverse()) await server.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
}

const grant = (consent: InMemoryConsentRepository, userId: string, purpose: 'recognition' | 'source_access'): void => {
  consent.grant({ userId, purpose, policyVersion: 'v1', channel: 'app' });
};

describe('API over loopback HTTP', () => {
  it('confirms a task, then reads it through fresh server and repository instances', async () => withApi(async ({ start, consent }) => {
    grant(consent, 'owner', 'recognition');
    grant(consent, 'owner', 'source_access');
    grant(consent, 'other', 'recognition');
    const first = await start();
    const created = await fetch(`${first.origin}/v1/recognition-tasks`, post({ taskId: 'owned-task', inputType: 'text', content: '无香洗衣液 2L' }));
    expect(created.status).toBe(201);
      const task = (await created.json() as { data: { taskId: string; status: string } }).data;
      expect(task).toMatchObject({ taskId: 'owned-task', status: 'needs_confirmation' });
      const resolveBody = { taskId: task.taskId, country: 'CN', currency: 'CNY' };
      const before = await fetch(`${first.origin}/v1/catalog/resolve`, post(resolveBody));
      expect(before.status).toBe(409);
      expect(await before.json()).toMatchObject({ error: { code: 'identity_confirmation_required' } });

      const crossUser = await fetch(`${first.origin}/v1/recognition-tasks/${task.taskId}`, { headers: headers('other') });
      expect(crossUser.status).toBe(404);
      expect(await crossUser.json()).toMatchObject({ error: { code: 'recognition_task_not_found' } });
      for (const action of ['confirm', 'delete']) {
        const denied = await fetch(`${first.origin}/v1/recognition-tasks/${task.taskId}`, post({ action }, 'other'));
        expect(denied.status).toBe(404);
        expect(await denied.json()).toMatchObject({ error: { code: 'recognition_task_not_found' } });
      }
      const confirmation = await fetch(`${first.origin}/v1/recognition-tasks/${task.taskId}`, post({ action: 'confirm' }));
      expect(confirmation.status).toBe(200);
      expect((await confirmation.json() as { data: { status: string } }).data.status).toBe('confirmed');
      await first.close();

      const restarted = await start();
      const recovered = await fetch(`${restarted.origin}/v1/recognition-tasks/${task.taskId}`, { headers: headers() });
      expect(recovered.status).toBe(200);
      expect((await recovered.json() as { data: { status: string; userId: string } }).data).toMatchObject({ status: 'confirmed', userId: 'owner' });
      const after = await fetch(`${restarted.origin}/v1/catalog/resolve`, post(resolveBody));
      expect(after.status).toBe(200);
      expect((await after.json() as { data: unknown }).data).toBeDefined();
  }));

  it('enforces authentication, consent, and invalid request mapping', async () => withApi(async ({ start, consent }) => {
    const server = await start();
    const path = `${server.origin}/v1/recognition-tasks`;
    const anonymous = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ error: { code: 'authentication_required' } });
    const absent = await fetch(path, post({ inputType: 'text', content: '洗衣液' }));
    expect(absent.status).toBe(403);
    expect(await absent.json()).toMatchObject({ error: { code: 'consent_required' } });
    grant(consent, 'owner', 'recognition');
    const malformed = await fetch(path, { method: 'POST', headers: headers(), body: '{' });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: 'invalid_recognition_request' } });
    const invalid = await fetch(path, post({ inputType: 'text' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'invalid_recognition_input' } });
    consent.revoke('owner', 'recognition');
    const revoked = await fetch(path, post({ inputType: 'text', content: '洗衣液' }));
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({ error: { code: 'consent_required' } });
  }));

  it('persists cases while enforcing ownership and idempotency', async () => withApi(async ({ start }) => {
    const first = await start();
    const path = `${first.origin}/v1/purchase-protection-cases`;
    const payload = casePayload('request-1');
    const created = await fetch(path, post(payload));
    expect(created.status).toBe(201);
    const record = (await created.json() as { data: { caseId: string; userId: string; version: number } }).data;
    expect(record.userId).toBe('owner');
    const duplicate = await fetch(path, post(payload));
    expect(duplicate.status).toBe(201);
    expect((await duplicate.json() as { data: { caseId: string } }).data.caseId).toBe(record.caseId);
    const conflict = await fetch(path, post(casePayload('request-1', 'different-event')));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'idempotency_conflict' } });
    await first.close();

    const restarted = await start();
    const recovered = await fetch(`${restarted.origin}/v1/purchase-protection-cases/${record.caseId}`, { headers: headers() });
    expect(recovered.status).toBe(200);
    expect((await recovered.json() as { data: { caseId: string } }).data.caseId).toBe(record.caseId);
    const forbidden = await fetch(`${restarted.origin}/v1/purchase-protection-cases/${record.caseId}`, { headers: headers('other') });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: 'principal_mismatch' } });
  }));

  it('maps an optimistic case version conflict to 409', async () => withApi(async ({ start }) => {
    const caseRepository = new InMemoryPurchaseProtectionCaseRepository();
    const server = await start({ caseRepository: {
      create: (record) => caseRepository.create(record),
      get: (caseId) => caseRepository.get(caseId),
      update: async () => { throw new CaseVersionConflictError(); },
      listByUser: (userId) => caseRepository.listByUser(userId),
      listAll: () => caseRepository.listAll(),
    } });
    const created = await fetch(`${server.origin}/v1/purchase-protection-cases`, post(casePayload('version-test')));
    expect(created.status).toBe(201);
    const caseId = (await created.json() as { data: { caseId: string } }).data.caseId;
    const conflict = await fetch(`${server.origin}/v1/purchase-protection-cases/${caseId}/actions`, post({ action: 'request_user_action' }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'idempotency_conflict' } });
  }));

  it('returns an opaque server error for unexpected recognition repository failures', async () => withApi(async ({ start, consent }) => {
    grant(consent, 'owner', 'recognition');
    const server = await start({
      recognitionTasks: {
        create: async () => { throw new Error('private-storage-path'); },
        get: async () => undefined,
        confirm: async () => { throw new Error('private-storage-path'); },
        delete: async () => { throw new Error('private-storage-path'); },
      },
    });
    const failure = await fetch(`${server.origin}/v1/recognition-tasks`, post({ inputType: 'text', content: '洗衣液' }));
    expect(failure.status).toBe(500);
    const body = await failure.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('private-storage-path');
  }));

  it('returns an opaque server error for unexpected case repository failures', async () => withApi(async ({ start }) => {
    const server = await start({
      caseRepository: {
        create: async () => { throw new Error('private-case-path'); },
        get: async () => undefined,
        update: async () => { throw new Error('private-case-path'); },
        listByUser: async () => [],
        listAll: async () => [],
      },
    });
    const failure = await fetch(`${server.origin}/v1/purchase-protection-cases`, post(casePayload('failure')));
    expect(failure.status).toBe(500);
    const body = await failure.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('private-case-path');
  }));
});
