import type { ExecutionPolicyDecision, ExecutionPolicyInput } from '@shopping-navigation/contracts';

export function evaluateExecutionPolicy(input: ExecutionPolicyInput, capabilityAvailable = false): ExecutionPolicyDecision {
  if (!capabilityAvailable) return denied('capability_unavailable');
  if (!input.userConfirmed) return denied('confirmation_required');
  if (!input.sourceAllowlisted) return denied('source_not_allowlisted');
  if (!input.categoryLowRisk) return denied('high_risk_category');
  if (input.amountMinor === undefined || input.budgetMinor === undefined || input.amountMinor > input.budgetMinor) return denied('budget_exceeded');
  if (!input.cooldownElapsed) return denied('cooldown_active');
  if (!input.idempotencyKey?.trim()) return denied('idempotency_required');
  return denied('capability_unavailable');
}

function denied(reason: ExecutionPolicyDecision['reason']): ExecutionPolicyDecision {
  return { allowed: false, reason, auditRequired: true };
}
