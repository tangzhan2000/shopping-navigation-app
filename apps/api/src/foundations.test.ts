import { describe, expect, it } from 'vitest';
import { InMemoryNotificationOutbox } from './notification-outbox.js';
import { AggregateVersionConflictError, InMemoryEventStore } from './event-store.js';

const event = (id: string, aggregateVersion: number) => ({ eventId: id, eventType: 'case.created', schemaVersion: 1, aggregateType: 'case', aggregateId: 'case-1', occurredAt: `2026-01-01T00:00:0${aggregateVersion}.000Z`, correlationId: 'corr', payload: {}, metadata: { actorType: 'system' as const, policyVersion: 'v1' } });

describe('event and notification foundations', () => {
  it('enforces aggregate optimistic versions', async () => {
    const store = new InMemoryEventStore();
    await store.append(event('event-1', 1), 0);
    expect(await store.aggregateVersion('case-1')).toBe(1);
    await expect(store.append(event('event-2', 2), 0)).rejects.toThrow(AggregateVersionConflictError);
    await store.append(event('event-2', 2), 1);
  });

  it('deduplicates and suppresses disabled notifications', () => {
    const outbox = new InMemoryNotificationOutbox();
    outbox.subscribe({ subscriptionId: 'sub-1', userId: 'user-1', kind: 'price', enabled: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1 });
    const delivery = { deliveryId: 'delivery-1', userId: 'user-1', kind: 'price' as const, dedupeKey: 'price-1', state: 'queued' as const, payload: { title: 'item' }, createdAt: '2026-01-01T00:00:00.000Z' };
    expect(outbox.enqueue(delivery).state).toBe('suppressed');
    expect(outbox.enqueue({ ...delivery, deliveryId: 'delivery-2' }).deliveryId).toBe('delivery-1');
  });
});
