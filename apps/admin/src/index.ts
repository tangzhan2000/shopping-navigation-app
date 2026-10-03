import type {
  CapabilityId,
  CapabilitySnapshot,
  CapabilityState,
  EvidenceBundle,
  PurchaseProtectionCase,
  SourceAccess,
} from '@shopping-navigation/contracts';
import { capabilityIds, InMemoryCapabilityRegistry } from '@shopping-navigation/domain';

interface CapabilityRegistry {
  get(capabilityId: CapabilityId): CapabilitySnapshot | undefined;
  transition(input: { capabilityId: CapabilityId; to: CapabilityState; reason: string; actorId: string; now: Date }): CapabilitySnapshot;
}

export interface AdminShell {
  readonly name: 'operations-console';
  readonly capabilities: readonly string[];
}

export const adminShell: AdminShell = {
  name: 'operations-console',
  capabilities: ['capability-state', 'source-health', 'evidence-review', 'case-queue', 'rbac', 'audit'],
};

export type AdminRole = 'operator' | 'reviewer' | 'compliance_admin' | 'security_admin';
export type AdminPermission =
  | 'capability.read'
  | 'capability.pause'
  | 'capability.resume'
  | 'source.read'
  | 'source.pause'
  | 'source.resume'
  | 'evidence.read'
  | 'evidence.review'
  | 'case.read'
  | 'case.assign'
  | 'audit.read';

export interface AdminPrincipal {
  readonly adminId: string;
  readonly roles: readonly AdminRole[];
}

export interface SourceControl {
  readonly sourceId: string;
  readonly paused: boolean;
  readonly reason: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export type EvidenceReviewStatus = 'pending' | 'approved' | 'rejected';
export interface EvidenceReviewItem {
  readonly reviewId: string;
  readonly evidence: EvidenceBundle;
  readonly status: EvidenceReviewStatus;
  readonly reason?: string;
  readonly assignedTo?: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface CaseQueueItem {
  readonly caseRecord: PurchaseProtectionCase;
  readonly assignedTo?: string;
  readonly queuedAt: string;
}

export type AdminAction =
  | 'capability.pause'
  | 'capability.resume'
  | 'source.pause'
  | 'source.resume'
  | 'evidence.review'
  | 'case.assign';

export interface SensitiveApproval {
  readonly approvalId: string;
  readonly action: AdminAction;
  readonly approver: AdminPrincipal;
  readonly approvedAt: string;
  readonly reason: string;
}

export interface AuditRecord {
  readonly auditId: string;
  readonly actorId: string;
  readonly action: string;
  readonly targetId: string;
  readonly outcome: 'allowed' | 'denied';
  readonly reason: string;
  readonly occurredAt: string;
  readonly approvalId?: string;
}

const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  operator: ['capability.read', 'source.read', 'evidence.read', 'case.read', 'case.assign'],
  reviewer: ['capability.read', 'source.read', 'evidence.read', 'evidence.review', 'case.read', 'case.assign'],
  compliance_admin: ['capability.read', 'capability.pause', 'capability.resume', 'source.read', 'source.pause', 'source.resume', 'evidence.read', 'evidence.review', 'case.read', 'case.assign', 'audit.read'],
  security_admin: ['capability.read', 'source.read', 'evidence.read', 'case.read', 'audit.read'],
};

const SENSITIVE_ACTIONS: readonly AdminAction[] = ['capability.pause', 'capability.resume', 'source.pause', 'source.resume'];

export interface AdminState {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly sources: readonly SourceControl[];
  readonly evidence: readonly EvidenceReviewItem[];
  readonly cases: readonly CaseQueueItem[];
  readonly auditRecords: readonly AuditRecord[];
}

export interface AdminStateStore {
  load(): Promise<AdminState | undefined>;
  save(state: AdminState): Promise<void>;
}

export class AdminAuthorizationError extends Error {
  public constructor(public readonly code: 'authentication_required' | 'permission_denied' | 'approval_required' | 'invalid_approval') {
    super(code);
    this.name = 'AdminAuthorizationError';
  }
}

export class AdminOperationsModel {
  private readonly sources = new Map<string, SourceControl>();
  private readonly evidence = new Map<string, EvidenceReviewItem>();
  private readonly cases = new Map<string, CaseQueueItem>();
  private readonly auditRecords: AuditRecord[] = [];
  private sequence = 0;

  public constructor(
    private readonly capabilityRegistry: CapabilityRegistry = new InMemoryCapabilityRegistry([]),
    private readonly now: () => Date = () => new Date(),
    initialState?: AdminState,
  ) {
    if (initialState) this.restoreState(initialState);
  }

  public exportState(): AdminState {
    return {
      schemaVersion: 1,
      sequence: this.sequence,
      sources: [...this.sources.values()],
      evidence: [...this.evidence.values()],
      cases: [...this.cases.values()],
      auditRecords: [...this.auditRecords],
    };
  }

  public restoreState(state: AdminState): void {
    if (state.schemaVersion !== 1 || !Number.isInteger(state.sequence) || state.sequence < 0
      || !Array.isArray(state.sources) || !Array.isArray(state.evidence)
      || !Array.isArray(state.cases) || !Array.isArray(state.auditRecords)) {
      throw new Error('Invalid admin state schema');
    }
    this.sources.clear();
    this.evidence.clear();
    this.cases.clear();
    this.auditRecords.splice(0, this.auditRecords.length);
    for (const source of state.sources) this.sources.set(source.sourceId, source);
    for (const item of state.evidence) this.evidence.set(item.reviewId, item);
    for (const item of state.cases) this.cases.set(item.caseRecord.caseId, item);
    this.auditRecords.push(...state.auditRecords);
    this.sequence = state.sequence;
  }

  public async persist(store: AdminStateStore): Promise<void> {
    await store.save(this.exportState());
  }
  public getCapability(capabilityId: CapabilityId, actor?: AdminPrincipal): CapabilitySnapshot | undefined {
    this.require(actor, 'capability.read', 'capability.read', capabilityId);
    return this.capabilityRegistry.get(capabilityId);
  }


  public listCapabilities(actor?: AdminPrincipal): readonly CapabilitySnapshot[] {
    this.require(actor, 'capability.read', 'capability.read', 'all');
    return capabilityIds().map((id) => this.capabilityRegistry.get(id)).filter((snapshot): snapshot is CapabilitySnapshot => snapshot !== undefined);
  }

  public setCapabilityState(input: {
    readonly actor?: AdminPrincipal;
    readonly capabilityId: CapabilityId;
    readonly state: Extract<CapabilityState, 'paused' | 'available' | 'restricted'>;
    readonly reason: string;
    readonly approval?: SensitiveApproval;
  }): CapabilitySnapshot {
    const action: AdminAction = input.state === 'paused' ? 'capability.pause' : 'capability.resume';
    this.require(input.actor, action, action, input.capabilityId, input.approval);
    const snapshot = this.capabilityRegistry.transition({
      capabilityId: input.capabilityId,
      to: input.state,
      reason: input.reason,
      actorId: input.actor!.adminId,
      now: this.now(),
    });
    this.record(input.actor!, action, input.capabilityId, 'allowed', input.reason, input.approval);
    return snapshot;
  }

  public getSource(sourceId: string, actor?: AdminPrincipal): SourceControl {
    this.require(actor, 'source.read', 'source.read', sourceId);
    return this.sources.get(sourceId) ?? this.defaultSource(sourceId);
  }

  public setSourcePaused(input: { readonly actor?: AdminPrincipal; readonly sourceId: string; readonly paused: boolean; readonly reason: string; readonly approval?: SensitiveApproval }): SourceControl {
    const action: AdminAction = input.paused ? 'source.pause' : 'source.resume';
    this.require(input.actor, action, action, input.sourceId, input.approval);
    const control: SourceControl = { sourceId: input.sourceId, paused: input.paused, reason: input.reason, updatedAt: this.now().toISOString(), updatedBy: input.actor!.adminId };
    this.sources.set(input.sourceId, control);
    this.record(input.actor!, action, input.sourceId, 'allowed', input.reason, input.approval);
    return control;
  }

  public enqueueEvidence(input: { readonly evidence: EvidenceBundle; readonly actor?: AdminPrincipal }): EvidenceReviewItem {
    this.require(input.actor, 'evidence.read', 'evidence.read', input.evidence.evidenceId);
    const item: EvidenceReviewItem = { reviewId: `evidence-review-${++this.sequence}`, evidence: input.evidence, status: 'pending', updatedAt: this.now().toISOString(), updatedBy: input.actor!.adminId };
    this.evidence.set(item.reviewId, item);
    return item;
  }

  public listEvidenceQueue(actor?: AdminPrincipal): readonly EvidenceReviewItem[] {
    this.require(actor, 'evidence.read', 'evidence.read', 'queue');
    return [...this.evidence.values()].filter((item) => item.status === 'pending');
  }

  public reviewEvidence(input: { readonly actor?: AdminPrincipal; readonly reviewId: string; readonly status: Exclude<EvidenceReviewStatus, 'pending'>; readonly reason: string }): EvidenceReviewItem {
    this.require(input.actor, 'evidence.review', 'evidence.review', input.reviewId);
    const current = this.evidence.get(input.reviewId);
    if (!current) throw new Error('Evidence review item not found');
    const item: EvidenceReviewItem = { ...current, status: input.status, reason: input.reason, updatedAt: this.now().toISOString(), updatedBy: input.actor!.adminId };
    this.evidence.set(item.reviewId, item);
    this.record(input.actor!, 'evidence.review', input.reviewId, 'allowed', input.reason);
    return item;
  }

  public enqueueCase(input: { readonly caseRecord: PurchaseProtectionCase; readonly actor?: AdminPrincipal }): CaseQueueItem {
    this.require(input.actor, 'case.read', 'case.read', input.caseRecord.caseId);
    const item: CaseQueueItem = { caseRecord: input.caseRecord, queuedAt: this.now().toISOString() };
    this.cases.set(item.caseRecord.caseId, item);
    return item;
  }

  public listCaseQueue(actor?: AdminPrincipal): readonly CaseQueueItem[] {
    this.require(actor, 'case.read', 'case.read', 'queue');
    return [...this.cases.values()];
  }

  public assignCase(input: { readonly actor?: AdminPrincipal; readonly caseId: string; readonly assignee: string }): CaseQueueItem {
    this.require(input.actor, 'case.assign', 'case.assign', input.caseId);
    if (!input.assignee.trim()) throw new Error('Assignee is required');
    const current = this.cases.get(input.caseId);
    if (!current) throw new Error('Case queue item not found');
    const item = { ...current, assignedTo: input.assignee };
    this.cases.set(input.caseId, item);
    this.record(input.actor!, 'case.assign', input.caseId, 'allowed', `Assigned to ${input.assignee}`);
    return item;
  }

  public listAuditRecords(actor?: AdminPrincipal): readonly AuditRecord[] {
    this.require(actor, 'audit.read', 'audit.read', 'audit');
    return [...this.auditRecords];
  }

  private require(actor: AdminPrincipal | undefined, permission: AdminPermission, action: string, targetId: string, approval?: SensitiveApproval): void {
    if (!actor?.adminId || !Array.isArray(actor.roles) || actor.roles.length === 0) throw new AdminAuthorizationError('authentication_required');
    const allowed = actor.roles.some((role): boolean => Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)
      && ROLE_PERMISSIONS[role as AdminRole].includes(permission));
    if (!allowed) {
      this.record(actor, action, targetId, 'denied', 'Permission denied');
      throw new AdminAuthorizationError('permission_denied');
    }
    if (SENSITIVE_ACTIONS.includes(action as AdminAction)) {
      if (!approval) { this.record(actor, action, targetId, 'denied', 'Second-party approval required'); throw new AdminAuthorizationError('approval_required'); }
      if (approval.action !== action || approval.approver.adminId === actor.adminId || !approval.reason.trim() || approval.approver.roles.includes('compliance_admin') === false) {
        this.record(actor, action, targetId, 'denied', 'Invalid second-party approval', approval);
        throw new AdminAuthorizationError('invalid_approval');
      }
    }
  }

  private record(actor: AdminPrincipal, action: string, targetId: string, outcome: AuditRecord['outcome'], reason: string, approval?: SensitiveApproval): void {
    this.auditRecords.push({ auditId: `audit-${++this.sequence}`, actorId: actor.adminId, action, targetId, outcome, reason, occurredAt: this.now().toISOString(), ...(approval ? { approvalId: approval.approvalId } : {}) });
  }

  private defaultSource(sourceId: string): SourceControl {
    return { sourceId, paused: true, reason: 'No source policy is configured', updatedAt: new Date(0).toISOString(), updatedBy: 'system' };
  }
}

export const ADMIN_ROLE_PERMISSIONS = ROLE_PERMISSIONS;
export const SENSITIVE_ADMIN_ACTIONS = SENSITIVE_ACTIONS;
export type { SourceAccess };
