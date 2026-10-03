import { describe, expect, it } from 'vitest';
import { createProtectionCase } from '@shopping-navigation/domain';
import { InMemoryEventStore } from './event-store.js';
import { InMemoryNotificationOutbox } from './notification-outbox.js';
import { InMemoryJobQueue } from './worker.js';
import { PurchaseProtectionScheduler } from './purchase-protection-scheduler.js';
import { PurchaseProtectionService } from './purchase-protection-service.js';
import { InMemoryPurchaseProtectionCaseRepository } from './purchase-store.js';

const createdAt = new Date('2026-10-03T00:00:00.000Z');
const dueAt = new Date('2026-10-03T01:00:00.000Z');

function makeCase() {
  return createProtectionCase({
    caseId: 'scheduled-case',
    userId: 'user-1',
    marketCode: 'CN',
    sourceId: 'shop-a',
    path: 'merchant_after_sales',
    responsibility: 'merchant',
    riskLevel: 'medium',
    idempotencyKey: 'scheduled-idem',
    responseSlaHours: 1,
    now: createdAt,
    event: {
      eventId: 'scheduled-event',
      issueType: 'delivery_delay',
      detectedAt: createdAt.toISOString(),
      evidence: [{
        evidenceId: 'scheduled-evidence',
        sourceType: 'user_import',
        reference: 'upload://scheduled',
        capturedAt: createdAt.toISOString(),
        freshness: 'current',
      }],
    },
  });
}

describe('PurchaseProtectionScheduler', () => {
  it('restores a queued deadline job and processes it idempotently', async () => {
    const repository = new InMemoryPurchaseProtectionCaseRepository();
    const queue = new InMemoryJobQueue();
    const service = new PurchaseProtectionService({
      repository,
      eventStore: new InMemoryEventStore(),
      notificationOutbox: new InMemoryNotificationOutbox(),
      jobQueue: queue,
      now: () => dueAt,
    });
    await service.create(makeCase());

    const scheduler = new PurchaseProtectionScheduler({ service, queue });
    expect((await scheduler.drain(dueAt.getTime())).map((item) => item.status)).toEqual(['completed']);
    expect((await scheduler.drain(dueAt.getTime())).map((item) => item.status)).toEqual([]);
    expect((await repository.get('scheduled-case'))?.escalationCount).toBe(1);
  });
});
