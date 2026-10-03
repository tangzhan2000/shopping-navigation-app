import { describe, expect, it } from 'vitest';
import { AggregateVersionConflictError, DuplicateEventError, InMemoryEventStore, replayEvents } from './event-store.js';

const event = { eventId: 'evt-1', eventType: 'case.created', schemaVersion: 1, aggregateType: 'case', aggregateId: 'case-1', occurredAt: '2026-10-01T00:00:00.000Z', correlationId: 'corr-1', payload: { count: 1 }, metadata: { actorType: 'system' as const, policyVersion: '1' } };

describe('event store', () => {
  it('appends once and replays deterministically', async () => {
    const store = new InMemoryEventStore();
    await store.append(event);
    await expect(store.append(event)).rejects.toThrow(DuplicateEventError);
    const events = await store.list('case-1');
    expect(events).toEqual([event]);
    expect(replayEvents(0, events, { apply: (sum, item) => sum + (item.payload as { count: number }).count })).toBe(1);
  });

  it('enforces expected aggregate versions without appending a conflicting event', async () => {
    const store = new InMemoryEventStore();
    await store.append(event, 0);
    await expect(store.append({ ...event, eventId: 'evt-2' }, 0)).rejects.toThrow(AggregateVersionConflictError);
    expect(await store.aggregateVersion(event.aggregateId)).toBe(1);
    expect(await store.get('evt-2')).toBeUndefined();
    await store.append({ ...event, eventId: 'evt-2' }, 1);
    expect(await store.aggregateVersion(event.aggregateId)).toBe(2);
  });
});
