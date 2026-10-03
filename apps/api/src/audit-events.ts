import type { EventEnvelope } from '@shopping-navigation/contracts';
import type { EventStore } from './event-store.js';

export const AUDIT_EVENT_TYPES = [
  'task_created',
  'recognition_completed',
  'recognition_confirmed',
  'recognition_deleted',
  'consent_granted',
  'consent_revoked',
  'cross_source_search_started',
  'cross_source_search_completed',
  'source_query_failed',
  'official_outbound_clicked',
  'official_outbound_failed',
  'purchase_protection_case_created',
  'purchase_protection_case_transitioned',
  'purchase_protection_case_reminder_enqueued',
] as const;

export type AuditEventType = typeof AUDIT_EVENT_TYPES[number];
export type AuditActorType = EventEnvelope<string, unknown>['metadata']['actorType'];

export interface AuditPayload {
  readonly status?: string;
  readonly reason?: string;
  readonly capabilityId?: string;
  readonly sourceId?: string;
  readonly sourceIds?: readonly string[];
  readonly resultCount?: number;
  readonly inputType?: string;
  readonly consentPurpose?: string;
  readonly caseId?: string;
  readonly caseStatus?: string;
  readonly issueType?: string;
  readonly path?: string;
  readonly deadlineAt?: string;
  readonly nextUserAction?: string;
  readonly resolution?: string;
  readonly officialCaseId?: string;
  readonly escalationCount?: number;
  readonly version?: number;
  readonly caseSnapshot?: Readonly<Record<string, unknown>>;
  readonly errorCategory?: string;
}

const ALLOWED_KEYS = new Set<keyof AuditPayload>([
  'status', 'reason', 'capabilityId', 'sourceId', 'sourceIds', 'resultCount',
  'inputType', 'consentPurpose', 'caseId', 'caseStatus', 'issueType', 'path',
  'deadlineAt', 'nextUserAction', 'resolution', 'officialCaseId', 'escalationCount', 'version', 'caseSnapshot', 'errorCategory',
]);

function sanitizePayload(payload: Readonly<Record<string, unknown>>): AuditPayload {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_KEYS.has(key as keyof AuditPayload)) continue;
    if (typeof value === 'string' && value.length <= 128) sanitized[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length <= 128)) sanitized[key] = value;
    else if (key === 'caseSnapshot' && value && typeof value === 'object') sanitized[key] = structuredClone(value);
  }
  return sanitized as AuditPayload;
}

export function createAuditEvent<TType extends AuditEventType>(input: {
  readonly eventId: string;
  readonly eventType: TType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly occurredAt?: Date;
  readonly actorType?: AuditActorType;
  readonly policyVersion?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}): EventEnvelope<TType, AuditPayload> {
  if (!input.eventId || !input.aggregateType || !input.aggregateId || !input.correlationId) throw new Error('Audit event identity is required');
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    schemaVersion: 1,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    correlationId: input.correlationId,
    payload: sanitizePayload(input.payload ?? {}),
    metadata: { actorType: input.actorType ?? 'system', policyVersion: input.policyVersion ?? 'v1' },
  };
}

export async function appendAuditEvent(store: EventStore, event: EventEnvelope<AuditEventType, AuditPayload>): Promise<void> {
  const version = await store.aggregateVersion(event.aggregateId);
  await store.append(event, version);
}
