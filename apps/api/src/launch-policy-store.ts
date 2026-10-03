import { randomUUID } from 'node:crypto';
import type { LaunchMarketPolicy } from '@shopping-navigation/contracts';
import {
  isLaunchPolicyEffective, PolicyOperationError, requirePolicyAdmin, validateLaunchPolicy, validatePolicyApproval,
  type PolicyAdminPrincipal, type PolicyApproval, type PolicyChange, type PolicyRevision,
} from '@shopping-navigation/domain';
import { JsonSnapshot, type SnapshotIO } from './json-snapshot.js';

interface PolicyState {
  readonly schemaVersion: 1;
  readonly revisions: readonly PolicyRevision[];
  readonly changes: readonly PolicyChange[];
}

export interface LaunchPolicyRepository {
  propose(input: { policy: LaunchMarketPolicy; actor: PolicyAdminPrincipal; reason: string; proposedAt: string; expectedCurrentVersion?: string; targetStatus?: 'active' | 'paused'; rollbackOfVersion?: string }): Promise<PolicyRevision>;
  approve(input: { marketCode: string; version: string; approval: PolicyApproval; expectedCurrentVersion?: string }): Promise<PolicyRevision>;
  current(marketCode: string, now?: Date): Promise<LaunchMarketPolicy | undefined>;
  versions(marketCode: string): Promise<readonly PolicyRevision[]>;
  audit(marketCode: string): Promise<readonly PolicyChange[]>;
}

const empty = (): PolicyState => ({ schemaVersion: 1, revisions: [], changes: [] });
const copy = <T>(value: T): T => structuredClone(value);
const latest = (state: PolicyState, marketCode: string) => state.revisions.filter((item) => item.policy.marketCode === marketCode).at(-1);
const approved = (state: PolicyState, marketCode: string) => state.revisions.filter((item) => item.policy.marketCode === marketCode && item.approval).at(-1);
const currentVersion = (state: PolicyState, marketCode: string) => approved(state, marketCode)?.policy.version;
const checkVersion = (state: PolicyState, marketCode: string, expected: string | undefined) => {
  if (currentVersion(state, marketCode) !== expected) throw new PolicyOperationError('version_conflict');
};
const time = (value: string): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function decodeState(raw: unknown): PolicyState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid launch policy snapshot');
  const state = raw as PolicyState;
  if (state.schemaVersion !== 1 || !Array.isArray(state.revisions) || !Array.isArray(state.changes)) throw new Error('Invalid launch policy snapshot');
  const marketVersions = new Map<string, number>();
  const policyIds = new Map<string, string>();
  const approvalIds = new Set<string>();
  const changeIds = new Set<string>();
  for (const revision of state.revisions) {
    try {
      validateLaunchPolicy(revision.policy);
      requirePolicyAdmin(revision.proposer);
      if (!time(revision.proposedAt) || !revision.reason?.trim()
        || !['active', 'paused'].includes(revision.targetStatus)
        || revision.policy.status !== (revision.approval ? revision.targetStatus : 'draft')) throw new Error('Invalid revision');
      const version = Number(revision.policy.version);
      const market = revision.policy.marketCode;
      if (version !== (marketVersions.get(market) ?? 0) + 1) throw new Error('Out of order policy version');
      marketVersions.set(market, version);
      const priorMarket = policyIds.get(revision.policy.policyId);
      if (priorMarket && priorMarket !== market) throw new Error('Policy ID reused across markets');
      policyIds.set(revision.policy.policyId, market);
      if (revision.rollbackOfVersion && (!state.revisions.some((prior) => prior.policy.marketCode === market && prior.policy.version === revision.rollbackOfVersion && prior.approval))) throw new Error('Invalid rollback reference');
      if (revision.approval) {
        validatePolicyApproval(revision.proposer, revision.approval, revision.approval.approvedAt);
        if (Date.parse(revision.approval.approvedAt) < Date.parse(revision.proposedAt)
          || approvalIds.has(revision.approval.approvalId)) throw new Error('Invalid policy approval');
        approvalIds.add(revision.approval.approvalId);
      }
    } catch { throw new Error('Invalid launch policy snapshot'); }
  }
  for (const change of state.changes) {
    if (!change || !change.changeId || changeIds.has(change.changeId) || !time(change.occurredAt)
      || !state.revisions.some((revision) => revision.policy.marketCode === change.marketCode
        && revision.policy.policyId === change.policyId && revision.policy.version === change.version)) throw new Error('Invalid launch policy audit');
    changeIds.add(change.changeId);
  }
  if (state.changes.length !== state.revisions.reduce((sum, revision) => sum + (revision.approval ? 2 : 1), 0)) throw new Error('Invalid launch policy audit');
  for (const revision of state.revisions) {
    const matching = state.changes.filter((change) => change.marketCode === revision.policy.marketCode && change.version === revision.policy.version);
    if (!matching.some((change) => change.action === (revision.rollbackOfVersion ? 'rolled_back' : 'proposed') && change.actorId === revision.proposer.adminId && change.occurredAt === revision.proposedAt)
      || (revision.approval ? !matching.some((change) => change.action === (revision.targetStatus === 'paused' ? 'paused' : 'approved')
        && change.approvalId === revision.approval?.approvalId && change.approverId === revision.approval.approver.adminId
        && change.occurredAt === revision.approval.approvedAt) : matching.length !== 1)) throw new Error('Invalid launch policy audit');
  }
  return copy(state);
}

function propose(state: PolicyState, input: Parameters<LaunchPolicyRepository['propose']>[0]): { state: PolicyState; result: PolicyRevision } {
  requirePolicyAdmin(input.actor);
  validateLaunchPolicy(input.policy);
  if (!input.reason?.trim() || !time(input.proposedAt) || input.policy.status !== 'draft') throw new PolicyOperationError('invalid_policy');
  const market = input.policy.marketCode;
  checkVersion(state, market, input.expectedCurrentVersion);
  const last = latest(state, market);
  if (last && !last.approval) throw new PolicyOperationError('version_conflict');
  if (last && (input.policy.policyId !== last.policy.policyId || Number(input.policy.version) !== Number(last.policy.version) + 1)) throw new PolicyOperationError('version_conflict');
  if (!last && input.policy.version !== '1') throw new PolicyOperationError('version_conflict');
  if (state.revisions.some((item) => item.policy.policyId === input.policy.policyId && item.policy.marketCode !== market)) throw new PolicyOperationError('invalid_policy');
  const targetStatus = input.targetStatus ?? 'active';
  if (!['active', 'paused'].includes(targetStatus)) throw new PolicyOperationError('invalid_policy');
  if (input.rollbackOfVersion) {
    const source = state.revisions.find((item) => item.policy.marketCode === market && item.policy.version === input.rollbackOfVersion && item.approval);
    if (!last || !source || source.policy.status !== targetStatus
      || JSON.stringify({ ...source.policy, version: input.policy.version, status: 'draft' }) !== JSON.stringify(input.policy)) {
      throw new PolicyOperationError('invalid_policy');
    }
  }
  const result: PolicyRevision = copy({ policy: input.policy, proposer: input.actor, proposedAt: input.proposedAt, reason: input.reason, targetStatus,
    ...(input.rollbackOfVersion ? { rollbackOfVersion: input.rollbackOfVersion } : {}) });
  const change: PolicyChange = { changeId: randomUUID(), action: input.rollbackOfVersion ? 'rolled_back' : 'proposed', marketCode: market,
    policyId: result.policy.policyId, version: result.policy.version, actorId: input.actor.adminId, reason: input.reason, occurredAt: input.proposedAt };
  return { state: { ...state, revisions: [...state.revisions, result], changes: [...state.changes, change] }, result: copy(result) };
}

function approve(state: PolicyState, input: Parameters<LaunchPolicyRepository['approve']>[0]): { state: PolicyState; result: PolicyRevision } {
  const pending = latest(state, input.marketCode);
  if (!pending || pending.policy.version !== input.version || pending.approval) throw new PolicyOperationError('not_found');
  checkVersion(state, input.marketCode, input.expectedCurrentVersion);
  validatePolicyApproval(pending.proposer, input.approval, input.approval.approvedAt);
  if (Date.parse(input.approval.approvedAt) < Date.parse(pending.proposedAt)
    || state.revisions.some((item) => item.approval?.approvalId === input.approval.approvalId)) throw new PolicyOperationError('invalid_approval');
  const result: PolicyRevision = { ...pending, policy: { ...pending.policy, status: pending.targetStatus }, approval: copy(input.approval) };
  const change: PolicyChange = { changeId: randomUUID(), action: result.targetStatus === 'paused' ? 'paused' : 'approved', marketCode: input.marketCode,
    policyId: result.policy.policyId, version: result.policy.version, actorId: input.approval.approver.adminId,
    reason: input.approval.reason, occurredAt: input.approval.approvedAt, approvalId: input.approval.approvalId, approverId: input.approval.approver.adminId };
  return { state: { ...state, revisions: state.revisions.map((item) => item === pending ? result : item), changes: [...state.changes, change] }, result: copy(result) };
}

function readCurrent(state: PolicyState, market: string, now: Date): LaunchMarketPolicy | undefined {
  const policy = approved(state, market)?.policy;
  return isLaunchPolicyEffective(policy, now) ? copy(policy) : undefined;
}

export class InMemoryLaunchPolicyRepository implements LaunchPolicyRepository {
  private state: PolicyState = empty();
  private pending: Promise<void> = Promise.resolve();
  private change<T>(action: (state: PolicyState) => { state: PolicyState; result: T }): Promise<T> {
    const result = this.pending.then(() => { const next = action(this.state); this.state = next.state; return next.result; });
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
  public propose(input: Parameters<LaunchPolicyRepository['propose']>[0]): Promise<PolicyRevision> { return this.change((state) => propose(state, input)); }
  public approve(input: Parameters<LaunchPolicyRepository['approve']>[0]): Promise<PolicyRevision> { return this.change((state) => approve(state, input)); }
  public async current(market: string, now = new Date()): Promise<LaunchMarketPolicy | undefined> { return readCurrent(this.state, market, now); }
  public async versions(market: string): Promise<readonly PolicyRevision[]> { return copy(this.state.revisions.filter((item) => item.policy.marketCode === market)); }
  public async audit(market: string): Promise<readonly PolicyChange[]> { return copy(this.state.changes.filter((item) => item.marketCode === market)); }
}

export class JsonFileLaunchPolicyRepository implements LaunchPolicyRepository {
  private readonly snapshot: JsonSnapshot<PolicyState>;
  public constructor(filePath: string, io?: SnapshotIO) { this.snapshot = new JsonSnapshot(filePath, empty, decodeState, io); }
  public propose(input: Parameters<LaunchPolicyRepository['propose']>[0]): Promise<PolicyRevision> { return this.snapshot.change((state) => propose(state, input)); }
  public approve(input: Parameters<LaunchPolicyRepository['approve']>[0]): Promise<PolicyRevision> { return this.snapshot.change((state) => approve(state, input)); }
  public current(market: string, now = new Date()): Promise<LaunchMarketPolicy | undefined> { return this.snapshot.read((state) => readCurrent(state, market, now)); }
  public versions(market: string): Promise<readonly PolicyRevision[]> { return this.snapshot.read((state) => copy(state.revisions.filter((item) => item.policy.marketCode === market))); }
  public audit(market: string): Promise<readonly PolicyChange[]> { return this.snapshot.read((state) => copy(state.changes.filter((item) => item.marketCode === market))); }
}
