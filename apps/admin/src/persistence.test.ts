import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdminOperationsModel, type AdminPrincipal } from './index.js';
import { JsonAdminStateStore, restoreAdminModel } from './persistence.js';

const reviewer: AdminPrincipal = { adminId: 'reviewer-1', roles: ['reviewer'] };

describe('JsonAdminStateStore', () => {
  it('restores admin queues and audit sequence across model instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-admin-'));
    try {
      const path = join(directory, 'admin.json');
      const store = new JsonAdminStateStore(path);
      const first = new AdminOperationsModel();
      first.enqueueEvidence({ actor: reviewer, evidence: {
        evidenceId: 'proof-1', sourceType: 'user_import', reference: 'upload://proof',
        capturedAt: '2026-10-03T00:00:00.000Z', freshness: 'current',
      } });
      await first.persist(store);
      const second = new AdminOperationsModel();
      await restoreAdminModel(store, second);
      expect(second.listEvidenceQueue(reviewer)).toHaveLength(1);
      const state = second.exportState();
      expect(state.sequence).toBe(first.exportState().sequence);
      expect(state.auditRecords).toEqual(first.exportState().auditRecords);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects corrupt or unsafe snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-admin-'));
    try {
      const path = join(directory, 'admin.json');
      const store = new JsonAdminStateStore(path);
      await store.save({ schemaVersion: 1, sequence: 0, sources: [], evidence: [], cases: [], auditRecords: [] });
      await chmod(path, 0o644);
      await expect(store.load()).rejects.toThrow('Unsafe admin state permissions');
      await chmod(path, 0o600);
      await (await import('node:fs/promises')).writeFile(path, '{"schemaVersion":99}', 'utf8');
      await expect(store.load()).rejects.toThrow('Invalid admin state schema');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
