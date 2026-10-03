import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from './event-store.js';
import { appendAuditEvent, createAuditEvent } from './audit-events.js';

describe('audit events', () => {
  it('keeps only replay-safe metadata and strips raw user content', () => {
    const event = createAuditEvent({
      eventId: 'audit-1', eventType: 'task_created', aggregateType: 'recognition_task', aggregateId: 'task-1', correlationId: 'corr-1',
      payload: {
        inputType: 'text', status: 'processing', content: 'secret address and token', token: 'secret-token', query: 'full user query', resultCount: 1,
      },
    });
    expect(event.payload).toEqual({ inputType: 'text', status: 'processing', resultCount: 1 });
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it('appends with aggregate version and remains replayable', async () => {
    const store = new InMemoryEventStore();
    const first = createAuditEvent({ eventId: 'audit-1', eventType: 'task_created', aggregateType: 'recognition_task', aggregateId: 'task-1', correlationId: 'corr-1' });
    const second = createAuditEvent({ eventId: 'audit-2', eventType: 'recognition_confirmed', aggregateType: 'recognition_task', aggregateId: 'task-1', correlationId: 'corr-1' });
    await appendAuditEvent(store, first);
    await appendAuditEvent(store, second);
    expect((await store.list('task-1')).map((item) => item.eventType)).toEqual(['task_created', 'recognition_confirmed']);
  });
});
