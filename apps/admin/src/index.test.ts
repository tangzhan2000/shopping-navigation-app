import { describe, expect, it } from 'vitest';
import type { EvidenceBundle } from '@shopping-navigation/contracts';
import { capabilityIds, InMemoryCapabilityRegistry } from '@shopping-navigation/domain';
import {
  AdminAuthorizationError,
  AdminOperationsModel,
  type AdminPrincipal,
  type SensitiveApproval,
} from './index.js';

const compliance: AdminPrincipal = { adminId: 'compliance-1', roles: ['compliance_admin'] };
const secondCompliance: AdminPrincipal = { adminId: 'compliance-2', roles: ['compliance_admin'] };
const operator: AdminPrincipal = { adminId: 'operator-1', roles: ['operator'] };
const reviewer: AdminPrincipal = { adminId: 'reviewer-1', roles: ['reviewer'] };
const approval = (action: SensitiveApproval['action'], approver: AdminPrincipal = compliance): SensitiveApproval => ({
  approvalId: `approval-${action}`,
  action,
  approver,
  approvedAt: '2026-10-01T00:00:00.000Z',
  reason: 'Reviewed and approved',
});
const evidence: EvidenceBundle = {
  evidenceId: 'proof-1', sourceType: 'user_import', reference: 'upload://proof',
  capturedAt: '2026-10-01T00:00:00.000Z', freshness: 'current',
};

function sampleCase() {
  const now = '2026-10-01T00:00:00.000Z';
  return {
    caseId: 'case-1', userId: 'user-1', marketCode: 'CN', issueType: 'delivery_delay' as const,
    path: 'merchant_after_sales' as const, status: 'detected' as const, responsibility: 'merchant' as const,
    riskLevel: 'medium' as const,
    event: { eventId: 'event-1', issueType: 'delivery_delay' as const, detectedAt: now, evidence: [evidence] },
    evidence: [evidence], escalationCount: 0, idempotencyKey: 'case-key', createdAt: now,
    updatedAt: now, version: 1,
  };
}

describe('AdminOperationsModel', () => {
  it('fails closed for absent principals and unknown source policy', () => {
    const model = new AdminOperationsModel();
    expect(model.getSource('unconfigured-source', compliance)).toMatchObject({ paused: true });
    expect(() => model.listCaseQueue()).toThrowError(AdminAuthorizationError);
    expect(() => model.listAuditRecords(operator)).toThrowError(AdminAuthorizationError);
    expect(() => model.getSource('source-a')).toThrowError(AdminAuthorizationError);
  });

  it('requires a distinct compliance approval for sensitive capability and source changes', () => {
    const registry = new InMemoryCapabilityRegistry(capabilityIds());
    const model = new AdminOperationsModel(registry);
    expect(() => model.setCapabilityState({ actor: compliance, capabilityId: 'F-001', state: 'paused', reason: 'Incident' }))
      .toThrowError(expect.objectContaining({ code: 'approval_required' }));
    expect(() => model.setCapabilityState({ actor: compliance, capabilityId: 'F-001', state: 'paused', reason: 'Incident', approval: approval('capability.pause', secondCompliance) }))
      .not.toThrow();
    expect(model.getCapability('F-001', compliance)?.state).toBe('paused');

    expect(() => model.setSourcePaused({ actor: compliance, sourceId: 'shop-a', paused: false, reason: 'Resume', approval: approval('source.resume', secondCompliance) }))
      .not.toThrow();
    expect(model.getSource('shop-a', compliance).paused).toBe(false);
    expect(() => model.setSourcePaused({ actor: compliance, sourceId: 'shop-a', paused: true, reason: 'Pause', approval: { ...approval('source.pause', secondCompliance), approver: compliance } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_approval' }));
  });

  it('enforces role permissions and audits both successful and denied operations', () => {
    const model = new AdminOperationsModel();
    expect(() => model.setSourcePaused({ actor: operator, sourceId: 'shop-a', paused: true, reason: 'Policy', approval: approval('source.pause', secondCompliance) }))
      .toThrowError(expect.objectContaining({ code: 'permission_denied' }));
    model.setSourcePaused({ actor: compliance, sourceId: 'shop-a', paused: true, reason: 'Policy', approval: approval('source.pause', secondCompliance) });
    const audit = model.listAuditRecords(compliance);
    expect(audit.map((record) => record.outcome)).toEqual(['denied', 'allowed']);
    expect(audit[1]).toMatchObject({ action: 'source.pause', targetId: 'shop-a', approvalId: 'approval-source.pause' });
  });

  it('provides evidence review and case assignment queues', () => {
    const model = new AdminOperationsModel();
    const queuedEvidence = model.enqueueEvidence({ actor: reviewer, evidence });
    expect(model.listEvidenceQueue(reviewer)).toHaveLength(1);
    expect(model.reviewEvidence({ actor: reviewer, reviewId: queuedEvidence.reviewId, status: 'approved', reason: 'Source and freshness checked' }).status).toBe('approved');
    expect(model.listEvidenceQueue(reviewer)).toHaveLength(0);

    model.enqueueCase({ actor: operator, caseRecord: sampleCase() });
    expect(model.assignCase({ actor: operator, caseId: 'case-1', assignee: 'agent-7' }).assignedTo).toBe('agent-7');
    expect(model.listCaseQueue(operator)[0]?.assignedTo).toBe('agent-7');
  });
});
