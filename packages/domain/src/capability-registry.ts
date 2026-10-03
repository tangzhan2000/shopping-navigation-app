import type { CapabilityId, CapabilitySnapshot, CapabilityState } from '@shopping-navigation/contracts';

export interface CapabilityEvidence {
  readonly evidenceId: string;
  readonly capabilityId: CapabilityId;
  readonly kind: 'implementation' | 'test' | 'authorization' | 'compliance' | 'operations';
  readonly reference: string;
  readonly version: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly expiresAt?: string;
}

export interface CapabilityRecord extends CapabilitySnapshot {
  readonly owner: string;
  readonly dependencies: readonly string[];
  readonly enableConditions: readonly string[];
  readonly rollbackConditions: readonly string[];
  readonly fallback: string;
  readonly evidence: readonly CapabilityEvidence[];
}

const ALLOWED_TRANSITIONS: Readonly<Record<CapabilityState, readonly CapabilityState[]>> = {
  designing: ['awaiting_platform_authorization', 'awaiting_data_coverage', 'awaiting_user_consent', 'awaiting_partner', 'awaiting_compliance_approval', 'available', 'restricted', 'paused'],
  awaiting_platform_authorization: ['available', 'restricted', 'paused', 'unsupported'],
  awaiting_data_coverage: ['available', 'restricted', 'paused', 'unsupported'],
  awaiting_user_consent: ['available', 'restricted', 'paused'],
  awaiting_partner: ['available', 'restricted', 'paused', 'unsupported'],
  awaiting_compliance_approval: ['available', 'restricted', 'paused', 'unsupported'],
  available: ['restricted', 'paused', 'unsupported'],
  restricted: ['available', 'paused', 'unsupported'],
  paused: ['available', 'restricted', 'unsupported'],
  unsupported: ['designing', 'awaiting_platform_authorization', 'awaiting_data_coverage', 'awaiting_partner', 'awaiting_compliance_approval'],
};

const CAPABILITY_IDS: readonly CapabilityId[] = Array.from({ length: 19 }, (_, index) => `F-${String(index + 1).padStart(3, '0')}` as CapabilityId);

const DEFAULTS: Readonly<Record<CapabilityId, Omit<CapabilityRecord, 'capabilityId' | 'updatedAt' | 'updatedBy' | 'evidence'>>> = {
  'F-001': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'product', dependencies: ['device_permissions', 'speech_provider'], enableConditions: ['speech_provider_authorized', 'privacy_review'], rollbackConditions: ['provider_failure', 'privacy_incident'], fallback: 'text_input' },
  'F-002': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'product', dependencies: ['task_store'], enableConditions: ['task_store_available'], rollbackConditions: ['storage_failure'], fallback: 'manual_task_start' },
  'F-003': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'product', dependencies: ['camera_or_share_permissions', 'ocr_provider'], enableConditions: ['ocr_provider_authorized'], rollbackConditions: ['ocr_failure'], fallback: 'text_or_url_input' },
  'F-004': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'product', dependencies: ['intent_provider'], enableConditions: ['model_evaluation_passed'], rollbackConditions: ['model_quality_regression'], fallback: 'editable_structured_fields' },
  'F-005': { state: 'awaiting_data_coverage', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'catalog', dependencies: ['catalog_store'], enableConditions: ['golden_catalog_available'], rollbackConditions: ['catalog_staleness'], fallback: 'unknown_product' },
  'F-006': { state: 'awaiting_data_coverage', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'catalog', dependencies: ['catalog_store', 'matching_rules'], enableConditions: ['matching_evaluation_passed'], rollbackConditions: ['match_quality_regression'], fallback: 'unknown_match' },
  'F-007': { state: 'awaiting_platform_authorization', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'commerce', dependencies: ['source_adapters', 'price_evidence'], enableConditions: ['source_authorization_active'], rollbackConditions: ['stale_price', 'source_incident'], fallback: 'unknown_price' },
  'F-008': { state: 'awaiting_platform_authorization', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'commerce', dependencies: ['source_adapters', 'launch_policy'], enableConditions: ['allowlist_and_authorization'], rollbackConditions: ['authorization_revoked', 'source_sla_breach'], fallback: 'no_search_results' },
  'F-009': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'commerce', dependencies: ['offer_data', 'tax_rules'], enableConditions: ['market_policy_active'], rollbackConditions: ['tax_rule_stale'], fallback: 'item_price_only' },
  'F-010': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'product', dependencies: ['offers', 'evidence'], enableConditions: ['evidence_complete'], rollbackConditions: ['evidence_missing'], fallback: 'transparent_unknown_state' },
  'F-011': { state: 'awaiting_data_coverage', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'recommendations', dependencies: ['catalog', 'image_model'], enableConditions: ['model_and_golden_set'], rollbackConditions: ['quality_regression'], fallback: 'no_personalized_recommendations' },
  'F-012': { state: 'awaiting_platform_authorization', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'commerce', dependencies: ['deep_link_authorization'], enableConditions: ['deep_link_and_disclosure_approved'], rollbackConditions: ['redirect_failure'], fallback: 'official_source_url' },
  'F-013': { state: 'restricted', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'operations', dependencies: ['review_queue'], enableConditions: ['review_queue_available'], rollbackConditions: ['queue_unavailable'], fallback: 'user_correction' },
  'F-014': { state: 'awaiting_platform_authorization', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'identity', dependencies: ['oauth_providers'], enableConditions: ['oauth_contracts_active'], rollbackConditions: ['scope_or_token_incident'], fallback: 'anonymous_mode' },
  'F-015': { state: 'awaiting_user_consent', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'product', dependencies: ['consent', 'scheduler'], enableConditions: ['explicit_consent'], rollbackConditions: ['consent_revoked'], fallback: 'manual_refresh' },
  'F-016': { state: 'awaiting_platform_authorization', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'aftercare', dependencies: ['order_adapters'], enableConditions: ['order_scope_authorized'], rollbackConditions: ['authorization_revoked'], fallback: 'user_import' },
  'F-017': { state: 'awaiting_partner', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'rewards', dependencies: ['affiliate_partner', 'order_events'], enableConditions: ['affiliate_contract_active'], rollbackConditions: ['attribution_failure'], fallback: 'no_reward_claim' },
  'F-018': { state: 'awaiting_compliance_approval', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'payments', dependencies: ['wallet_ledger', 'payout_provider'], enableConditions: ['payment_and_kyc_approval'], rollbackConditions: ['payout_incident'], fallback: 'display_non_withdrawable_status' },
  'F-019': { state: 'awaiting_compliance_approval', scope: { sourceIds: [], countries: [], categories: [] }, owner: 'automation', dependencies: ['risk_engine', 'platform_purchase_api'], enableConditions: ['independent_safety_approval'], rollbackConditions: ['safety_incident'], fallback: 'user_confirmed_official_redirect' },
};

export class InvalidCapabilityTransitionError extends Error {
  constructor(from: CapabilityState, to: CapabilityState) {
    super(`Invalid capability transition: ${from} -> ${to}`);
    this.name = 'InvalidCapabilityTransitionError';
  }
}

export class InMemoryCapabilityRegistry {
  private readonly records = new Map<CapabilityId, CapabilityRecord>();

  constructor(input?: Date | readonly CapabilityId[], now = new Date()) {
    const initialIds = input instanceof Date || input === undefined ? CAPABILITY_IDS : input;
    const timestamp = input instanceof Date ? input : now;
    const useProductionDefaults = !(input instanceof Array);
    for (const capabilityId of initialIds) {
      const definition = DEFAULTS[capabilityId];
      if (!definition) continue;
      this.records.set(capabilityId, { ...definition, state: useProductionDefaults ? definition.state : 'designing', capabilityId, updatedAt: timestamp.toISOString(), updatedBy: 'system', evidence: [] });
    }
  }

  public list(): readonly CapabilityRecord[] { return [...this.records.values()].map((record) => ({ ...record, evidence: [...record.evidence] })); }
  public get(capabilityId: CapabilityId): CapabilityRecord { const record = this.records.get(capabilityId); if (!record) throw new Error(`Unknown capability ${capabilityId}`); return { ...record, evidence: [...record.evidence] }; }

  public transition(input: { capabilityId: CapabilityId; to: CapabilityState; scope?: CapabilitySnapshot['scope']; reason: string; actorId: string; now?: Date }): CapabilityRecord {
    const current = this.get(input.capabilityId);
    if (!(ALLOWED_TRANSITIONS[current.state] ?? []).includes(input.to)) throw new InvalidCapabilityTransitionError(current.state, input.to);
    if (input.to === 'available' && current.enableConditions.some((condition) => condition.includes('authorization') || condition.includes('contract') || condition.includes('approval'))) {
      const now = (input.now ?? new Date()).getTime();
      const requiredKinds = current.enableConditions.some((condition) => condition.includes('authorization') || condition.includes('contract')) ? ['authorization'] : ['compliance'];
      const validEvidence = current.evidence.some((item) => requiredKinds.includes(item.kind) && (item.expiresAt === undefined || Date.parse(item.expiresAt) > now));
      if (!validEvidence) throw new Error(`Capability ${input.capabilityId} requires current ${requiredKinds.join('/')} evidence before activation`);
    }    const next = { ...current, state: input.to, scope: input.scope ?? current.scope, reason: input.reason, updatedAt: (input.now ?? new Date()).toISOString(), updatedBy: input.actorId };
    this.records.set(input.capabilityId, next);
    return { ...next, evidence: [...next.evidence] };
  }

  public addEvidence(input: CapabilityEvidence): CapabilityRecord {
    const current = this.get(input.capabilityId);
    const next = { ...current, evidence: [...current.evidence, input], updatedAt: input.recordedAt, updatedBy: input.recordedBy };
    this.records.set(input.capabilityId, next);
    return { ...next, evidence: [...next.evidence] };
  }
}

