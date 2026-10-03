import { describe, expect, it } from 'vitest';
import { createProtectionCase } from '@shopping-navigation/domain';
import { InMemoryPurchaseProtectionCaseRepository } from './purchase-store.js';
import { InMemoryNotificationOutbox } from './notification-outbox.js';
import { InMemoryEventStore } from './event-store.js';
import { PurchaseProtectionService } from './purchase-protection-service.js';

const now = new Date('2026-10-03T00:00:00.000Z');
const makeCase = () => createProtectionCase({
  caseId: 'case-1', userId: 'user-1', marketCode: 'CN', sourceId: 'shop-a', path: 'merchant_after_sales',
  responsibility: 'merchant', riskLevel: 'medium', idempotencyKey: 'idem-1', responseSlaHours: 1, now,
  event: { eventId: 'event-1', issueType: 'delivery_delay', detectedAt: now.toISOString(), evidence: [{ evidenceId: 'evidence-1', sourceType: 'user_import', reference: 'upload://one', capturedAt: now.toISOString(), freshness: 'current' }] },
});

describe('PurchaseProtectionService', () => {
  it('escalates a due case once and enqueues an aftercare notification', async () => {
    const repository = new InMemoryPurchaseProtectionCaseRepository();
    const outbox = new InMemoryNotificationOutbox();
    const events = new InMemoryEventStore();
    const service = new PurchaseProtectionService({ repository, notificationOutbox: outbox, eventStore: events, now: () => new Date('2026-10-03T01:00:00.000Z') });
    await service.create(makeCase());
    const first = await service.processDue('case-1');
    const second = await service.processDue('case-1');
    expect(first.caseRecord.escalationCount).toBe(1);
    expect(first.notification?.kind).toBe('aftercare');
    expect(second.caseRecord.escalationCount).toBe(1);
    expect(outbox.list('user-1')).toHaveLength(1);
    expect((await events.list('case-1'))).toHaveLength(2);
    expect((await service.timeline('case-1'))).toHaveLength(2);
    expect((await service.replay('case-1'))).toMatchObject({ caseId: 'case-1', status: first.caseRecord.status, escalationCount: 1, version: first.caseRecord.version });
  });
});
