import type {
  AftercareEvent,
  EvidenceBundle,
  ProtectionCaseStatus,
  ProtectionIssueType,
  ProtectionPath,
  PurchaseProtectionCase,
} from '@shopping-navigation/contracts';

const TERMINAL: readonly ProtectionCaseStatus[] = ['resolved', 'dismissed', 'expired', 'failed'];
const ISSUE_TYPES: ReadonlySet<ProtectionIssueType> = new Set(['order_not_synced', 'delivery_delay', 'delivery_loss', 'price_difference', 'return_window', 'merchant_after_sales', 'reward_missing_order', 'reward_reversal']);
const MERCHANT_ISSUES: ReadonlySet<ProtectionIssueType> = new Set(['order_not_synced', 'delivery_delay', 'delivery_loss', 'price_difference', 'return_window', 'merchant_after_sales']);
const RESPONSIBILITIES: ReadonlySet<PurchaseProtectionCase['responsibility']> = new Set(['merchant', 'platform', 'product', 'user', 'unknown']);
const RISK_LEVELS: ReadonlySet<PurchaseProtectionCase['riskLevel']> = new Set(['low', 'medium', 'high']);
const SOURCE_TYPES: ReadonlySet<EvidenceBundle['sourceType']> = new Set(['platform', 'user_import', 'system']);
const FRESHNESS: ReadonlySet<EvidenceBundle['freshness']> = new Set(['current', 'stale', 'unknown']);
const TRANSITIONS: Readonly<Record<ProtectionCaseStatus, readonly ProtectionCaseStatus[]>> = {
  detected: ['needs_user_action', 'dismissed', 'failed'],
  needs_user_action: ['handed_off', 'dismissed', 'expired', 'failed'],
  handed_off: ['awaiting_external', 'resolved', 'failed'],
  awaiting_external: ['resolved', 'expired', 'failed'],
  resolved: [],
  dismissed: [],
  expired: [],
  failed: [],
};

function eventIsValid(event: AftercareEvent): boolean {
  return typeof event.eventId === 'string' && event.eventId.trim() !== ''
    && ISSUE_TYPES.has(event.issueType)
    && Number.isFinite(Date.parse(event.detectedAt))
    && event.evidence.length > 0
    && event.evidence.every((e) => typeof e.evidenceId === 'string' && e.evidenceId.trim() !== '' && SOURCE_TYPES.has(e.sourceType)
      && typeof e.reference === 'string' && e.reference.trim() !== '' && Number.isFinite(Date.parse(e.capturedAt)) && FRESHNESS.has(e.freshness));
}

export class ProtectionCaseError extends Error {
  public constructor(public readonly code: 'invalid_transition' | 'terminal_case' | 'invalid_event') {
    super(code);
    this.name = 'ProtectionCaseError';
  }
}

export interface CreateProtectionCaseInput {
  readonly caseId: string;
  readonly userId: string;
  readonly marketCode: string;
  readonly sourceId?: string;
  readonly orderReference?: string;
  readonly orderLineReference?: string;
  readonly event: AftercareEvent;
  readonly path: PurchaseProtectionCase['path'];
  readonly responsibility: PurchaseProtectionCase['responsibility'];
  readonly riskLevel: PurchaseProtectionCase['riskLevel'];
  readonly nextUserAction?: string;
  readonly deadlineAt?: string;
  readonly responseSlaHours?: number;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export function createProtectionCase(input: CreateProtectionCaseInput): PurchaseProtectionCase {
  if (!input.caseId || !input.userId || !input.marketCode || !input.idempotencyKey || !eventIsValid(input.event)) {
    throw new ProtectionCaseError('invalid_event');
  }
  const expectedPath: ProtectionPath = MERCHANT_ISSUES.has(input.event.issueType) ? 'merchant_after_sales' : 'product_reward_dispute';
  if (input.path !== expectedPath || !RESPONSIBILITIES.has(input.responsibility) || !RISK_LEVELS.has(input.riskLevel)) {
    throw new ProtectionCaseError('invalid_event');
  }
  const now = (input.now ?? new Date()).toISOString();
  const deadlineAt = input.deadlineAt ?? (input.responseSlaHours === undefined ? undefined : new Date(Date.parse(now) + input.responseSlaHours * 60 * 60 * 1000).toISOString());
  if (input.responseSlaHours !== undefined && (!Number.isFinite(input.responseSlaHours) || input.responseSlaHours <= 0)) throw new ProtectionCaseError('invalid_event');
  if (deadlineAt !== undefined && !Number.isFinite(Date.parse(deadlineAt))) throw new ProtectionCaseError('invalid_event');
  return {
    caseId: input.caseId,
    userId: input.userId,
    ...(input.orderReference === undefined ? {} : { orderReference: input.orderReference }),
    ...(input.orderLineReference === undefined ? {} : { orderLineReference: input.orderLineReference }),
    marketCode: input.marketCode,
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
    issueType: input.event.issueType,
    path: input.path,
    status: 'detected',
    responsibility: input.responsibility,
    riskLevel: input.riskLevel,
    event: input.event,
    evidence: input.event.evidence,
    ...(input.nextUserAction === undefined ? {} : { nextUserAction: input.nextUserAction }),
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
    ...(input.responseSlaHours === undefined ? {} : { responseSlaHours: input.responseSlaHours }),
    escalationCount: 0,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export interface ProtectionDeadlineEvaluation {
  readonly due: boolean;
  readonly action: 'none' | 'escalate';
  readonly reason?: 'missing_deadline' | 'terminal' | 'before_deadline' | 'already_escalated' | 'deadline_reached';
}

export function evaluateProtectionDeadline(current: PurchaseProtectionCase, now = new Date()): ProtectionDeadlineEvaluation {
  if (TERMINAL.includes(current.status)) return { due: false, action: 'none', reason: 'terminal' };
  if (!current.deadlineAt || !Number.isFinite(Date.parse(current.deadlineAt))) return { due: false, action: 'none', reason: 'missing_deadline' };
  if (now.getTime() < Date.parse(current.deadlineAt)) return { due: false, action: 'none', reason: 'before_deadline' };
  if (current.escalationCount > 0) return { due: true, action: 'none', reason: 'already_escalated' };
  return { due: true, action: 'escalate', reason: 'deadline_reached' };
}

export interface ProtectionCaseAction {
  readonly status: Exclude<ProtectionCaseStatus, 'detected'>;
  readonly officialCaseId?: string;
  readonly resolution?: string;
  readonly nextUserAction?: string;
  readonly escalation?: boolean;
  readonly now?: Date;
}

export function transitionProtectionCase(
  current: PurchaseProtectionCase,
  action: ProtectionCaseAction,
): PurchaseProtectionCase {
  if (TERMINAL.includes(current.status)) throw new ProtectionCaseError('terminal_case');
  const allowedTargets = TRANSITIONS[current.status];
  if (!allowedTargets || !allowedTargets.includes(action.status)) throw new ProtectionCaseError('invalid_transition');
  if (action.status === 'resolved' && !action.resolution) throw new ProtectionCaseError('invalid_event');
  const now = (action.now ?? new Date()).toISOString();
  return {
    ...current,
    status: action.status,
    ...(action.officialCaseId === undefined ? {} : { officialCaseId: action.officialCaseId }),
    ...(action.resolution === undefined ? {} : { resolution: action.resolution }),
    ...(action.nextUserAction === undefined ? {} : { nextUserAction: action.nextUserAction }),
    escalationCount: current.escalationCount + (action.escalation ? 1 : 0),
    updatedAt: now,
    version: current.version + 1,
  };
}
