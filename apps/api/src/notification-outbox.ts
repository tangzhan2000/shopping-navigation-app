import type { NotificationDelivery, NotificationSubscription } from '@shopping-navigation/contracts';

export interface NotificationOutbox {
  subscribe(subscription: NotificationSubscription): NotificationSubscription;
  enqueue(delivery: NotificationDelivery): NotificationDelivery;
  get(deliveryId: string): NotificationDelivery | undefined;
  list(userId?: string): readonly NotificationDelivery[];
  markSent(deliveryId: string, sentAt?: string): NotificationDelivery;
  markFailed?(deliveryId: string, failureReason: string): NotificationDelivery;
}

export class InMemoryNotificationOutbox implements NotificationOutbox {
  private readonly subscriptions = new Map<string, NotificationSubscription>();
  private readonly deliveries = new Map<string, NotificationDelivery>();

  public subscribe(subscription: NotificationSubscription): NotificationSubscription {
    this.subscriptions.set(subscription.subscriptionId, subscription);
    return subscription;
  }

  public enqueue(delivery: NotificationDelivery): NotificationDelivery {
    const duplicate = [...this.deliveries.values()].find((item) => item.userId === delivery.userId && item.dedupeKey === delivery.dedupeKey);
    if (duplicate) return duplicate;
    const subscription = [...this.subscriptions.values()].find((item) => item.userId === delivery.userId && item.kind === delivery.kind);
    const stored = subscription && !subscription.enabled ? { ...delivery, state: 'suppressed' as const } : delivery;
    this.deliveries.set(stored.deliveryId, stored);
    return stored;
  }

  public get(deliveryId: string): NotificationDelivery | undefined { return this.deliveries.get(deliveryId); }
  public list(userId?: string): readonly NotificationDelivery[] { return [...this.deliveries.values()].filter((item) => userId === undefined || item.userId === userId); }
  public markSent(deliveryId: string, sentAt = new Date().toISOString()): NotificationDelivery {
    const current = this.deliveries.get(deliveryId);
    if (!current) throw new Error('Notification delivery not found');
    const updated: NotificationDelivery = { ...current, state: 'sent', sentAt };
    this.deliveries.set(deliveryId, updated);
    return updated;
  }
}
