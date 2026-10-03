import type { EventEnvelope } from '@shopping-navigation/contracts';
import { AggregateVersionConflictError, DuplicateEventError, InMemoryEventStore, type EventStore } from './event-store.js';
import { JsonSnapshot, type SnapshotIO } from './json-snapshot.js';

interface EventFileState { readonly schemaVersion: 1; readonly events: readonly EventEnvelope<string, unknown>[]; }

function isEvent(value: unknown): value is EventEnvelope<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<EventEnvelope<string, unknown>>;
  return typeof event.eventId === 'string' && !!event.eventId && typeof event.eventType === 'string' && !!event.eventType
    && Number.isInteger(event.schemaVersion) && typeof event.aggregateType === 'string' && typeof event.aggregateId === 'string'
    && typeof event.occurredAt === 'string' && typeof event.correlationId === 'string'
    && event.metadata !== null && typeof event.metadata === 'object'
    && ['user', 'system', 'admin', 'provider'].includes(event.metadata.actorType)
    && typeof event.metadata.policyVersion === 'string' && event.payload !== undefined;
}

async function eventMemory(state: EventFileState): Promise<InMemoryEventStore> {
  const store = new InMemoryEventStore();
  for (const event of state.events) await store.append(event);
  return store;
}

async function decodeEventState(raw: unknown): Promise<EventFileState> {
  if (!raw || typeof raw !== 'object') throw new Error('Unsupported event store schema');
  const state = raw as Partial<EventFileState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.events)) throw new Error('Unsupported event store schema');
  if (!state.events.every(isEvent)) throw new Error('Invalid event record');
  await eventMemory({ schemaVersion: 1, events: state.events });
  return { schemaVersion: 1, events: state.events };
}

export class JsonFileEventStore implements EventStore {
  private readonly snapshot: JsonSnapshot<EventFileState>;
  public constructor(filePath: string, io?: SnapshotIO) {
    this.snapshot = new JsonSnapshot<EventFileState>(filePath, () => ({ schemaVersion: 1, events: [] }), decodeEventState, io);
  }
  public append<TType extends string, TPayload>(event: EventEnvelope<TType, TPayload>, expectedAggregateVersion?: number): Promise<void> {
    return this.snapshot.change(async (state) => {
      const store = await eventMemory(state);
      await store.append(event, expectedAggregateVersion);
      return { state: { schemaVersion: 1, events: await store.list() }, result: undefined };
    });
  }
  public get(eventId: string): Promise<EventEnvelope<string, unknown> | undefined> {
    return this.snapshot.read(async (state) => (await eventMemory(state)).get(eventId));
  }
  public list(aggregateId?: string): Promise<readonly EventEnvelope<string, unknown>[]> {
    return this.snapshot.read((state) => aggregateId === undefined ? state.events : state.events.filter((event) => event.aggregateId === aggregateId));
  }
  public aggregateVersion(aggregateId: string): Promise<number> {
    return this.snapshot.read((state) => state.events.filter((event) => event.aggregateId === aggregateId).length);
  }
}

export { AggregateVersionConflictError, DuplicateEventError };
