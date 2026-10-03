import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonFileConsentRepository } from './consent-store.js';

describe('json consent repository', () => {
  it('merges updates from stale repository instances under the file lock', () => {
    const directory = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'shopping-consents-'));
    const path = join(directory, 'consents.json');
    try {
      const first = new JsonFileConsentRepository(path);
      const second = new JsonFileConsentRepository(path);
      first.grant({ userId: 'user-1', purpose: 'recognition', policyVersion: 'v1', channel: 'app', now: '2026-01-01T00:00:00.000Z' });
      second.grant({ userId: 'user-2', purpose: 'recognition', policyVersion: 'v1', channel: 'app', now: '2026-01-01T00:00:01.000Z' });
      const restored = new JsonFileConsentRepository(path);
      expect(restored.current('user-1', 'recognition')?.state).toBe('granted');
      expect(restored.current('user-2', 'recognition')?.state).toBe('granted');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('persists grants and revocations across repository instances', () => {
    const directory = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'shopping-consents-'));
    const path = join(directory, 'consents.json');
    try {
      const first = new JsonFileConsentRepository(path);
      first.grant({ userId: 'user-1', purpose: 'recognition', policyVersion: 'v1', channel: 'app', now: '2026-01-01T00:00:00.000Z' });
      expect(new JsonFileConsentRepository(path).current('user-1', 'recognition')?.state).toBe('granted');
      first.revoke('user-1', 'recognition', '2026-01-01T00:01:00.000Z');
      const restored = new JsonFileConsentRepository(path);
      expect(restored.current('user-1', 'recognition')).toBeUndefined();
      expect(restored.list('user-1')[0]).toMatchObject({ consentId: 'consent-1', state: 'revoked', version: 2, revokedAt: '2026-01-01T00:01:00.000Z' });
      expect(JSON.parse(readFileSync(path, 'utf8')).schemaVersion).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
