import type { EventEnvelope } from '@shopping-navigation/contracts';

export interface EventStore {
  append<TType extends string, TPayload>(event: EventEnvelope<TType, TPayload>, expectedAggregateVersion?: number): Promise<void>;
  get(eventId: string): Promise<EventEnvelope<string, unknown> | undefined>;
  list(aggregateId?: string): Promise<readonly EventEnvelope<string, unknown>[]>;
  aggregateVersion(aggregateId: string): Promise<number>;
}

export class AggregateVersionConflictError extends Error {
  public constructor(aggregateId: string, expected: number, actual: number) { super(`Aggregate ${aggregateId} expected version ${expected}, actual ${actual}`); this.name = 'AggregateVersionConflictError'; }
}

export class DuplicateEventError extends Error {
  public constructor(eventId: string) { super(`Event ${eventId} already exists`); this.name = 'DuplicateEventError'; }
}

export class InMemoryEventStore implements EventStore {
  private readonly events = new Map<string, EventEnvelope<string, unknown>>();

  public async append<TType extends string, TPayload>(event: EventEnvelope<TType, TPayload>, expectedAggregateVersion?: number): Promise<void> {
    if (this.events.has(event.eventId)) throw new DuplicateEventError(event.eventId);
    const actual = await this.aggregateVersion(event.aggregateId);
    if (expectedAggregateVersion !== undefined && expectedAggregateVersion !== actual) throw new AggregateVersionConflictError(event.aggregateId, expectedAggregateVersion, actual);
    this.events.set(event.eventId, structuredClone(event) as EventEnvelope<string, unknown>);
  }

  public async get(eventId: string): Promise<EventEnvelope<string, unknown> | undefined> {
    const event = this.events.get(eventId);
    return event ? structuredClone(event) : undefined;
  }

  public async list(aggregateId?: string): Promise<readonly EventEnvelope<string, unknown>[]> {
    return [...this.events.values()].filter((event) => aggregateId === undefined || event.aggregateId === aggregateId).map((event) => structuredClone(event));
  }

  public async aggregateVersion(aggregateId: string): Promise<number> {
    return [...this.events.values()].filter((event) => event.aggregateId === aggregateId).length;
  }
}

export interface EventProjection<TState> {
  apply(state: TState, event: EventEnvelope<string, unknown>): TState;
}

export function replayEvents<TState>(initialState: TState, events: readonly EventEnvelope<string, unknown>[], projection: EventProjection<TState>): TState {
  return [...events].sort((left, right) => {
    const leftVersion = typeof left.payload === 'object' && left.payload !== null && typeof (left.payload as { version?: unknown }).version === 'number'
      ? (left.payload as { version: number }).version : undefined;
    const rightVersion = typeof right.payload === 'object' && right.payload !== null && typeof (right.payload as { version?: unknown }).version === 'number'
      ? (right.payload as { version: number }).version : undefined;
    if (leftVersion !== undefined && rightVersion !== undefined && leftVersion !== rightVersion) return leftVersion - rightVersion;
    return left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId);
  }).reduce((state, event) => projection.apply(state, event), initialState);
}
