import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

describe('mobile API client', () => {
  it('unwraps the API envelope and creates recognition tasks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { taskId: 'task-1', fields: [], status: 'needs_confirmation' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.recognize('text', '洗衣液');
    expect(result.taskId).toBe('task-1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/recognition-tasks'), expect.objectContaining({ method: 'POST' }));
  });

  it('builds a scoped comparison request and preserves evidence data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { comparisonScope: { country: 'CN', currency: 'CNY', quantity: 2, sourceIds: ['fixture-shop-a'], memberStatus: 'unknown' }, evidencePolicy: 'scoped', results: [] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.compare({ taskId: 'task-1', candidateId: 'variant-1', quantity: 2, currency: 'CNY', country: 'CN' });
    expect(result.results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('taskId=task-1'), expect.objectContaining({ headers: expect.any(Object) }));
  });


  it('maps unavailable compare routes to typed API errors without fabricating data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'launch_policy_unconfigured', message: 'unavailable' } }), { status: 503 })));
    await expect(api.capabilities()).rejects.toMatchObject({ status: 503, code: 'launch_policy_unconfigured' });
  });

  it('sends explicit confirmation for sandbox-only handoff without assuming a purchase URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { state: 'sandbox_only', notice: 'No link was opened' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmation = { taskId: 'task-1', candidateId: 'variant-1', variantId: 'variant-1', sourceId: 'fixture-shop-a', quantity: 1, budgetMinor: 10500, priceConditionsAccepted: true };
    expect(await api.prepareSandboxHandoff(confirmation)).toEqual({ state: 'sandbox_only', notice: 'No link was opened' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(confirmation);
  });

  it('maps offline failures to actionable messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(api.sources()).rejects.toMatchObject({ status: 0, code: 'network_unavailable' });
  });
});
