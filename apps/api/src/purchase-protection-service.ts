import crypto from 'node:crypto';
import { createAuditEvent, appendAuditEvent } from './audit-events.js';
import type { AuditEventType } from './audit-events.js';
import { evaluateProtectionDeadline, transitionProtectionCase, type ProtectionCaseAction } from '@shopping-navigation/domain';
import type { EventEnvelope, NotificationDelivery, PurchaseProtectionCase } from '@shopping-navigation/contracts';
import { replayEvents, type EventStore } from './event-store.js';
import type { PurchaseProtectionCaseRepository } from './purchase-store.js';
import type { NotificationOutbox } from './notification-outbox.js';
import type { JobQueue } from './worker.js';

export interface PurchaseProtectionServiceOptions {
  readonly repository: PurchaseProtectionCaseRepository;
  readonly eventStore?: EventStore;
  readonly notificationOutbox?: { enqueue(delivery: NotificationDelivery): NotificationDelivery | Promise<NotificationDelivery> };
  readonly jobQueue?: JobQueue;
  readonly now?: () => Date;
  readonly audit?: (eventType: AuditEventType, aggregateId: string, payload: Readonly<Record<string, unknown>>) => Promise<void>;
}

export interface CaseActionResult {
  readonly caseRecord: PurchaseProtectionCase;
  readonly notification?: NotificationDelivery;
}

export class PurchaseProtectionService {
  private readonly now: () => Date;

  public constructor(private readonly options: PurchaseProtectionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  public async create(caseRecord: PurchaseProtectionCase): Promise<PurchaseProtectionCase> {
    const created = await this.options.repository.create(caseRecord);
    await this.record('purchase_protection_case_created', created, { caseStatus: created.status, deadlineAt: created.deadlineAt, escalationCount: created.escalationCount, version: created.version, caseSnapshot: { ...created, version: 0 } });
    if (created.deadlineAt && this.options.jobQueue) {
      await this.options.jobQueue.enqueue({
        jobId: `purchase-protection-deadline:${created.caseId}`,
        type: 'purchase_protection_deadline',
        payload: { caseId: created.caseId },
        idempotencyKey: `purchase-protection-deadline:${created.caseId}`,
        availableAt: Date.parse(created.deadlineAt),
      });
    }
    return created;
  }

  public async listByUser(userId: string): Promise<readonly PurchaseProtectionCase[]> {
    return this.options.repository.listByUser(userId);
  }

  public async timeline(caseId: string): Promise<readonly EventEnvelope<string, unknown>[]> {
    if (!this.options.eventStore) return [];
    return this.options.eventStore.list(caseId);
  }

  public async replay(caseId: string): Promise<PurchaseProtectionCase | undefined> {
    const events = await this.timeline(caseId);
    if (events.length === 0) return undefined;
    const creation = events.find((event) => event.eventType === 'purchase_protection_case_created');
    if (!creation) throw new Error('Purchase protection case creation event is missing');
    const creationPayload = creation.payload as Record<string, unknown>;
    const snapshot = creationPayload.caseSnapshot;
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Purchase protection case snapshot is missing');
    const initial = snapshot as PurchaseProtectionCase;
    if (initial.caseId !== caseId || initial.version !== 0) throw new Error('Invalid purchase protection case creation snapshot');
    return replayEvents(initial, events, {
      apply: (state, event) => {
        if (event.aggregateId !== caseId) throw new Error('Purchase protection event aggregate mismatch');
        const eventPayload = event.payload as Record<string, unknown>;
        const version = eventPayload.version;
        if (typeof version === 'number' && version < state.version) throw new Error('Purchase protection event version is out of order');
        if (event.eventType === 'purchase_protection_case_created' || event.eventType === 'purchase_protection_case_transitioned') {
          return {
            ...state,
            ...(typeof eventPayload.caseStatus === 'string' ? { status: eventPayload.caseStatus as PurchaseProtectionCase['status'] } : {}),
            ...(typeof eventPayload.deadlineAt === 'string' ? { deadlineAt: eventPayload.deadlineAt } : {}),
            ...(typeof eventPayload.nextUserAction === 'string' ? { nextUserAction: eventPayload.nextUserAction } : {}),
            ...(typeof eventPayload.resolution === 'string' ? { resolution: eventPayload.resolution } : {}),
            ...(typeof eventPayload.officialCaseId === 'string' ? { officialCaseId: eventPayload.officialCaseId } : {}),
            ...(typeof eventPayload.escalationCount === 'number' ? { escalationCount: eventPayload.escalationCount } : {}),
            ...(typeof version === 'number' ? { version, updatedAt: event.occurredAt } : {}),
          };
        }
        if (event.eventType === 'purchase_protection_case_reminder_enqueued') return state;
        throw new Error(`Unsupported purchase protection event ${event.eventType}`);
      },
    });
  }

  public get(caseId: string): Promise<PurchaseProtectionCase | undefined> {
    return this.options.repository.get(caseId);
  }

  public async act(caseId: string, action: ProtectionCaseAction): Promise<CaseActionResult> {
    const current = await this.options.repository.get(caseId);
    if (!current) throw new Error('case_not_found');
    const updated = transitionProtectionCase(current, action);
    const saved = await this.options.repository.update(updated, current.version);
    await this.record('purchase_protection_case_transitioned', saved, {
      caseStatus: saved.status,
      escalationCount: saved.escalationCount,
      deadlineAt: saved.deadlineAt,
      nextUserAction: saved.nextUserAction,
      resolution: saved.resolution,
      officialCaseId: saved.officialCaseId,
      version: saved.version,
      caseSnapshot: { ...saved },
    });
    return { caseRecord: saved };
  }

  public async processDue(caseId: string): Promise<CaseActionResult> {
    const current = await this.options.repository.get(caseId);
    if (!current) throw new Error('case_not_found');
    const evaluation = evaluateProtectionDeadline(current, this.now());
    if (evaluation.action !== 'escalate') return { caseRecord: current };
    const action: ProtectionCaseAction = {
      status: current.status === 'needs_user_action' || current.status === 'awaiting_external' ? current.status : 'needs_user_action',
      escalation: true,
      nextUserAction: current.path === 'merchant_after_sales' ? 'Contact the merchant with the evidence bundle' : 'Review the reward dispute evidence',
      now: this.now(),
    };
    const saved = await this.options.repository.update(transitionProtectionCase(current, action), current.version);
    await this.record('purchase_protection_case_transitioned', saved, {
      caseStatus: saved.status,
      escalationCount: saved.escalationCount,
      reason: 'deadline_reached',
      deadlineAt: saved.deadlineAt,
      nextUserAction: saved.nextUserAction,
      resolution: saved.resolution,
      officialCaseId: saved.officialCaseId,
      version: saved.version,
      caseSnapshot: { ...saved },
    });
    const notification = await this.enqueueReminder(saved, 'deadline_escalated');
    return { caseRecord: saved, ...(notification ? { notification } : {}) };
  }

  private async enqueueReminder(caseRecord: PurchaseProtectionCase, stage: string): Promise<NotificationDelivery | undefined> {
    if (!this.options.notificationOutbox) return undefined;
    const delivery: NotificationDelivery = {
      deliveryId: `${caseRecord.caseId}:${stage}:${caseRecord.version}`,
      userId: caseRecord.userId,
      kind: 'aftercare',
      dedupeKey: `${caseRecord.caseId}:${stage}:${caseRecord.version}`,
      state: 'queued',
      payload: { caseId: caseRecord.caseId, status: caseRecord.status, nextUserAction: caseRecord.nextUserAction ?? '', deadlineAt: caseRecord.deadlineAt ?? '' },
      createdAt: this.now().toISOString(),
    };
    return this.options.notificationOutbox.enqueue(delivery);
  }

  private async record(eventType: AuditEventType, caseRecord: PurchaseProtectionCase, payload: Readonly<Record<string, unknown>>): Promise<void> {
    if (this.options.audit) {
      await this.options.audit(eventType, caseRecord.caseId, payload);
      return;
    }
    if (!this.options.eventStore) return;
    await appendAuditEvent(this.options.eventStore, createAuditEvent({ eventId: crypto.randomUUID(), eventType, aggregateType: 'purchase_protection_case', aggregateId: caseRecord.caseId, correlationId: crypto.randomUUID(), occurredAt: this.now(), payload }));
  }
}
