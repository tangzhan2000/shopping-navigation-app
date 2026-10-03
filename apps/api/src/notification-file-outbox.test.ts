import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonFileNotificationOutbox } from './notification-file-outbox.js';

const subscription = {
  subscriptionId: 'sub-1', userId: 'user-1', kind: 'aftercare' as const, enabled: true,
  createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z', version: 1,
};
const delivery = {
  deliveryId: 'delivery-1', userId: 'user-1', kind: 'aftercare' as const, dedupeKey: 'case-1:reminder:1',
  state: 'queued' as const, payload: { caseId: 'case-1', nextAction: 'upload evidence' }, createdAt: '2026-10-03T00:00:00.000Z',
};

describe('JsonFileNotificationOutbox', () => {
  it('persists subscriptions and deduplicates deliveries across instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-notifications-'));
    const file = join(directory, 'notifications.json');
    try {
      const first = new JsonFileNotificationOutbox(file);
      await first.subscribe(subscription);
      expect(await first.enqueue(delivery)).toEqual(delivery);
      expect((await first.enqueue({ ...delivery, deliveryId: 'delivery-2' })).deliveryId).toBe('delivery-1');
      const second = new JsonFileNotificationOutbox(file);
      expect(await second.list('user-1')).toEqual([delivery]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('suppresses disabled subscriptions and records delivery failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopping-notifications-'));
    const file = join(directory, 'notifications.json');
    try {
      const outbox = new JsonFileNotificationOutbox(file);
      await outbox.subscribe({ ...subscription, enabled: false });
      expect((await outbox.enqueue(delivery)).state).toBe('suppressed');
      const failed = await outbox.markFailed('delivery-1', 'provider unavailable');
      expect(failed).toMatchObject({ state: 'failed', failureReason: 'provider unavailable' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
