import type { NotificationDelivery, NotificationSubscription } from '@shopping-navigation/contracts';
import { JsonSnapshot } from './json-snapshot.js';

interface NotificationFileState {
  readonly schemaVersion: 1;
  readonly subscriptions: readonly NotificationSubscription[];
  readonly deliveries: readonly NotificationDelivery[];
}

function decodeState(raw: unknown): NotificationFileState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid notification outbox state');
  const state = raw as Partial<NotificationFileState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.subscriptions) || !Array.isArray(state.deliveries)) {
    throw new Error('Unsupported notification outbox schema');
  }
  return { schemaVersion: 1, subscriptions: state.subscriptions, deliveries: state.deliveries };
}

export class JsonFileNotificationOutbox {
  private readonly snapshot: JsonSnapshot<NotificationFileState>;

  public constructor(path: string) {
    this.snapshot = new JsonSnapshot(path, () => ({ schemaVersion: 1, subscriptions: [], deliveries: [] }), decodeState);
  }

  public subscribe(subscription: NotificationSubscription): Promise<NotificationSubscription> {
    return this.snapshot.change((state) => {
      const subscriptions = [...state.subscriptions.filter((item) => item.subscriptionId !== subscription.subscriptionId), structuredClone(subscription)];
      return { state: { ...state, subscriptions }, result: structuredClone(subscription) };
    });
  }

  public enqueue(delivery: NotificationDelivery): Promise<NotificationDelivery> {
    return this.snapshot.change((state) => {
      const duplicate = state.deliveries.find((item) => item.userId === delivery.userId && item.dedupeKey === delivery.dedupeKey);
      if (duplicate) return { state, result: structuredClone(duplicate) };
      const subscription = state.subscriptions.find((item) => item.userId === delivery.userId && item.kind === delivery.kind);
      const stored = subscription && !subscription.enabled ? { ...delivery, state: 'suppressed' as const } : delivery;
      return { state: { ...state, deliveries: [...state.deliveries, structuredClone(stored)] }, result: structuredClone(stored) };
    });
  }

  public get(deliveryId: string): Promise<NotificationDelivery | undefined> {
    return this.snapshot.read((state) => {
      const delivery = state.deliveries.find((item) => item.deliveryId === deliveryId);
      return delivery ? structuredClone(delivery) : undefined;
    });
  }

  public list(userId?: string): Promise<readonly NotificationDelivery[]> {
    return this.snapshot.read((state) => state.deliveries.filter((item) => userId === undefined || item.userId === userId).map((item) => structuredClone(item)));
  }

  public markSent(deliveryId: string, sentAt = new Date().toISOString()): Promise<NotificationDelivery> {
    return this.updateDelivery(deliveryId, (current) => {
      const { failureReason: _failureReason, ...withoutFailure } = current;
      return { ...withoutFailure, state: 'sent', sentAt };
    });
  }

  public markFailed(deliveryId: string, failureReason: string): Promise<NotificationDelivery> {
    if (!failureReason.trim()) throw new Error('Notification failure reason is required');
    return this.updateDelivery(deliveryId, (current) => ({ ...current, state: 'failed', failureReason }));
  }

  private updateDelivery(deliveryId: string, update: (current: NotificationDelivery) => NotificationDelivery): Promise<NotificationDelivery> {
    return this.snapshot.change((state) => {
      const current = state.deliveries.find((item) => item.deliveryId === deliveryId);
      if (!current) throw new Error('Notification delivery not found');
      const updated = update(current);
      return { state: { ...state, deliveries: state.deliveries.map((item) => item.deliveryId === deliveryId ? updated : item) }, result: structuredClone(updated) };
    });
  }
}
