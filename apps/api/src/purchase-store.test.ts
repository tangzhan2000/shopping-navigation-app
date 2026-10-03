import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFilePurchaseProtectionCaseRepository } from './purchase-store.js';
import { createProtectionCase } from '@shopping-navigation/domain';

async function tempFile(): Promise<{ directory: string; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'shopping-cases-'));
  return { directory, file: join(directory, 'cases.json') };
}

function makeCase(idempotencyKey = 'case-1') {
  return createProtectionCase({
    caseId: `case-${idempotencyKey}`,
    userId: 'user-1',
    marketCode: 'CN',
    sourceId: 'fixture-shop-a',
    path: 'merchant_after_sales',
    responsibility: 'merchant',
    riskLevel: 'medium',
    idempotencyKey,
    event: {
      eventId: `event-${idempotencyKey}`,
      issueType: 'delivery_delay',
      detectedAt: '2026-10-01T00:00:00.000Z',
      evidence: [{ evidenceId: 'evidence-1', sourceType: 'user_import', reference: 'upload://proof', capturedAt: '2026-10-01T00:00:00.000Z', freshness: 'current' }],
    },
  });
}

describe('JsonFilePurchaseProtectionCaseRepository', () => {
  it('persists cases, preserves ownership and restores them in a new instance', async () => {
    const location = await tempFile();
    try {
      const first = new JsonFilePurchaseProtectionCaseRepository(location.file);
      const created = await first.create(makeCase());
      expect(await first.get(created.caseId)).toMatchObject({ userId: 'user-1', status: 'detected' });
      expect((await stat(location.file)).mode & 0o777).toBe(0o600);
      expect(await new JsonFilePurchaseProtectionCaseRepository(location.file).get(created.caseId)).toMatchObject({ caseId: created.caseId });
      expect(await new JsonFilePurchaseProtectionCaseRepository(location.file).listByUser('other-user')).toEqual([]);
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });

  it('rejects malformed state instead of treating it as empty', async () => {
    const location = await tempFile();
    try {
      await writeFile(location.file, JSON.stringify({ schemaVersion: 999, cases: [] }), { encoding: 'utf8', mode: 0o600 });
      await expect(new JsonFilePurchaseProtectionCaseRepository(location.file).listAll()).rejects.toThrow('Unsupported purchase case store schema');
      await expect(readFile(location.file, 'utf8')).resolves.toContain('999');
    } finally { await rm(location.directory, { recursive: true, force: true }); }
  });
});
