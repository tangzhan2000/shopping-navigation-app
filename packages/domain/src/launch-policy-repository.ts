import type { LaunchMarketPolicy } from '@shopping-navigation/contracts';

export type PolicyAdminRole = 'operator' | 'reviewer' | 'compliance_admin' | 'security_admin';
export interface PolicyAdminPrincipal {
  readonly adminId: string;
  readonly roles: readonly PolicyAdminRole[];
}

export interface PolicyApproval {
  readonly approvalId: string;
  readonly approver: PolicyAdminPrincipal;
  readonly reason: string;
  readonly approvedAt: string;
}

export interface PolicyChange {
  readonly changeId: string;
  readonly action: 'proposed' | 'approved' | 'paused' | 'rolled_back';
  readonly marketCode: string;
  readonly policyId: string;
  readonly version: string;
  readonly actorId: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly approvalId?: string;
  readonly approverId?: string;
}

export interface PolicyRevision {
  readonly policy: LaunchMarketPolicy;
  readonly proposer: PolicyAdminPrincipal;
  readonly proposedAt: string;
  readonly reason: string;
  readonly targetStatus: 'active' | 'paused';
  readonly rollbackOfVersion?: string;
  readonly approval?: PolicyApproval;
}

export class PolicyOperationError extends Error {
  public constructor(public readonly code: 'invalid_policy' | 'invalid_approval' | 'version_conflict' | 'not_found') {
    super(code);
    this.name = 'PolicyOperationError';
  }
}

function invalid(): never { throw new PolicyOperationError('invalid_policy'); }
function validTime(value: string | undefined): boolean { return value !== undefined && Number.isFinite(Date.parse(value)); }
function uniqueNonempty(values: readonly string[]): boolean {
  return Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === 'string' && value.trim() === value && value !== '')
    && new Set(values).size === values.length;
}

export function validateLaunchPolicy(policy: LaunchMarketPolicy): void {
  if (!policy || typeof policy !== 'object' || !policy.policyId?.trim() || !/^[1-9]\d*$/.test(policy.version)
    || !/^[A-Z]{2}$/.test(policy.marketCode) || !/^[A-Z]{2}$/.test(policy.jurisdiction)
    || !/^[A-Z]{3}$/.test(policy.currency) || typeof policy.timezone !== 'string'
    || !Intl.supportedValuesOf('timeZone').includes(policy.timezone)
    || !['country', 'region', 'postal_code'].includes(policy.deliveryDestinationGranularity)
    || !policy.taxRegime?.trim() || !['draft', 'active', 'paused'].includes(policy.status)
    || !uniqueNonempty(policy.allowedCountries) || !policy.allowedCountries.every((country) => /^[A-Z]{2}$/.test(country))
    || !uniqueNonempty(policy.allowedCategories) || !uniqueNonempty(policy.sourceAllowlist)
    || !uniqueNonempty(policy.authorizationIds)
    || (policy.effectiveAt !== undefined && !validTime(policy.effectiveAt))
    || (policy.expiresAt !== undefined && !validTime(policy.expiresAt))
    || (policy.effectiveAt !== undefined && policy.expiresAt !== undefined && Date.parse(policy.expiresAt) <= Date.parse(policy.effectiveAt))) invalid();
}

export function requirePolicyAdmin(principal: PolicyAdminPrincipal, role: PolicyAdminRole = 'compliance_admin'): void {
  if (!principal || typeof principal.adminId !== 'string' || !principal.adminId.trim()
    || !Array.isArray(principal.roles) || !principal.roles.includes(role)) {
    throw new PolicyOperationError('invalid_approval');
  }
}

export function validatePolicyApproval(proposer: PolicyAdminPrincipal, approval: PolicyApproval, at: string): void {
  requirePolicyAdmin(approval?.approver);
  if (!proposer?.adminId || proposer.adminId === approval.approver.adminId || !approval.approvalId?.trim()
    || !approval.reason?.trim() || !validTime(approval.approvedAt) || !validTime(at)
    || Date.parse(approval.approvedAt) > Date.parse(at)) throw new PolicyOperationError('invalid_approval');
}

export function isLaunchPolicyEffective(policy: LaunchMarketPolicy | undefined, now = new Date()): policy is LaunchMarketPolicy {
  return policy?.status === 'active' && (!policy.effectiveAt || now.getTime() >= Date.parse(policy.effectiveAt))
    && (!policy.expiresAt || now.getTime() < Date.parse(policy.expiresAt));
}
