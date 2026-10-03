export const CONTRACT_VERSION = '2026-10-01';

export type CapabilityState =
  | 'designing'
  | 'awaiting_platform_authorization'
  | 'awaiting_data_coverage'
  | 'awaiting_user_consent'
  | 'awaiting_partner'
  | 'awaiting_compliance_approval'
  | 'available'
  | 'restricted'
  | 'paused'
  | 'unsupported';

export type CapabilityId =
  | 'F-001'
  | 'F-002'
  | 'F-003'
  | 'F-004'
  | 'F-005'
  | 'F-006'
  | 'F-007'
  | 'F-008'
  | 'F-009'
  | 'F-010'
  | 'F-011'
  | 'F-012'
  | 'F-013'
  | 'F-014'
  | 'F-015'
  | 'F-016'
  | 'F-017'
  | 'F-018'
  | 'F-019';

export type MatchLevel = 'exact' | 'variant' | 'substitute' | 'similar' | 'unknown';
export type PriceState = 'verified' | 'estimated' | 'stale' | 'unknown';
export type SourceAccess = 'api' | 'feed' | 'deep_link' | 'user_import';

export interface CanonicalProduct {
  readonly productId: string;
  readonly brand?: string;
  readonly title: string;
  readonly category: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly evidenceIds: readonly string[];
}

export interface ProductVariant {
  readonly variantId: string;
  readonly productId: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly identifiers: Readonly<Record<string, string>>;
}

export interface SourceListing {
  readonly listingId: string;
  readonly sourceId: string;
  readonly variantId: string;
  readonly url: string;
  readonly access: SourceAccess;
  readonly region: string;
  readonly capturedAt: string;
}

export interface CatalogResolveRequest {
  readonly taskId: string;
  readonly query?: string;
  readonly url?: string;
  readonly country: string;
  readonly currency: string;
  readonly quantity: number;
  readonly sourceIds?: readonly string[];
}

export interface CatalogCandidate {
  readonly candidateId: string;
  readonly product: CanonicalProduct;
  readonly variant: ProductVariant;
  readonly listing: SourceListing;
  readonly matchLevel: MatchLevel;
  readonly reasons: readonly string[];
  readonly missingAttributes: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly offer?: Offer;
  readonly priceState: PriceState;
}

export interface CatalogResolveResponse {
  readonly candidates: readonly CatalogCandidate[];
  readonly queriedSourceIds: readonly string[];
  readonly notice?: string;
}

export interface Offer {
  readonly offerId: string;
  readonly listingId: string;
  readonly variantId: string;
  readonly sourceId: string;
  readonly evidenceId: string;
  readonly price: PriceEvidence;
  readonly availability: 'in_stock' | 'out_of_stock' | 'unknown';
  readonly promotionIds: readonly string[];
  readonly promotionEvidence?: readonly PromotionEvidence[];
}

export type PromotionKind = 'subsidy' | 'coupon' | 'campaign' | 'member_price' | 'unknown';

export interface PromotionEvidence {
  readonly promotionId: string;
  readonly kind: PromotionKind;
  readonly label?: string;
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly capturedAt: string;
  readonly expiresAt: string;
  readonly sourceReference: string;
  readonly verified: boolean;
}

export interface TotalCost {
  readonly currency: string;
  readonly itemMinor: number;
  readonly shippingMinor?: number;
  readonly taxMinor?: number;
  readonly discountMinor?: number;
  readonly totalMinor: number;
  readonly state: PriceState;
  readonly unknownComponents: readonly ('shipping' | 'tax' | 'discount')[];
}

export interface SourceQuery {
  readonly queryId: string;
  readonly scope: ComparisonScope;
  readonly variantId?: string;
  readonly text?: string;
}

export interface SourceAdapter {
  readonly sourceId: string;
  readonly access: SourceAccess;
  search(query: SourceQuery): Promise<readonly Offer[]>;
}

export interface CapabilitySnapshot {
  readonly capabilityId: CapabilityId;
  readonly state: CapabilityState;
  readonly scope: {
    readonly sourceIds: readonly string[];
    readonly countries: readonly string[];
    readonly categories: readonly string[];
  };
  readonly reason?: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface ComparisonScope {
  readonly country: string;
  readonly currency: string;
  readonly quantity: number;
  readonly sourceIds: readonly string[];
  readonly memberStatus: 'member' | 'non_member' | 'unknown';
  readonly deliveryDeadline?: string;
}

export interface EventEnvelope<TType extends string, TPayload> {
  readonly eventId: string;
  readonly eventType: TType;
  readonly schemaVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: TPayload;
  readonly metadata: {
    readonly actorType: 'user' | 'system' | 'admin' | 'provider';
    readonly policyVersion: string;
  };
}

export interface PriceEvidence {
  readonly evidenceId: string;
  readonly offerId: string;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly expiresAt: string;
  readonly priceState: PriceState;
  readonly currency: string;
  readonly displayPriceMinor: number;
  readonly shippingMinor?: number;
  readonly taxMinor?: number;
  readonly discountMinor?: number;
  readonly sourceReference: string;
  readonly ruleVersion: string;
}

export interface RecognitionField {
  readonly name: string;
  readonly value: string;
  readonly confidence: number;
  readonly confirmedByUser: boolean;
}

export interface Principal {
  readonly userId: string;
}

export interface RecognitionTask {
  readonly taskId: string;
  readonly userId: string;
  readonly inputType: 'voice' | 'text' | 'image' | 'share' | 'taobao_token' | 'url';
  readonly fields: readonly RecognitionField[];
  readonly status: 'processing' | 'needs_confirmation' | 'confirmed' | 'failed' | 'deleted';
}

export type AttributionStatus =
  | 'not_detected'
  | 'tracked'
  | 'merchant_pending'
  | 'return_window'
  | 'commission_confirmed'
  | 'attribution_failed'
  | 'order_not_matched'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'reversed'
  | 'disputed'
  | 'expired';

export interface AttributionSession {
  readonly attributionId: string;
  readonly userId: string;
  readonly sourceId: string;
  readonly clickId?: string;
  readonly subId?: string;
  readonly status: AttributionStatus;
  readonly attributionWindowEndsAt?: string;
  readonly orderReference?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidenceIds: readonly string[];
  readonly version: number;
}

export type RewardEntitlementStatus = AttributionStatus
  | 'user_available'
  | 'payout_pending'
  | 'paid'
  | 'payout_failed'
  | 'frozen';

export interface RewardEntitlement {
  readonly entitlementId: string;
  readonly userId: string;
  readonly attributionId: string;
  readonly orderReference?: string;
  readonly orderLineReference?: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly refundedMinor: number;
  readonly status: RewardEntitlementStatus;
  readonly ruleVersion: string;
  readonly evidenceIds: readonly string[];
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface RewardLedgerEntry {
  readonly entryId: string;
  readonly accountId: string;
  readonly entitlementId?: string;
  readonly payoutId?: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly entryType: 'credit' | 'debit' | 'freeze' | 'unfreeze' | 'reversal';
  readonly idempotencyKey: string;
  readonly sourceEventId: string;
  readonly createdAt: string;
}

export type RewardEventType =
  | 'attribution.tracked'
  | 'attribution.failed'
  | 'order.matched'
  | 'commission.pending'
  | 'commission.confirmed'
  | 'order.cancelled'
  | 'refund.recorded'
  | 'reward.disputed'
  | 'reward.frozen'
  | 'reward.unfrozen'
  | 'payout.requested'
  | 'payout.paid'
  | 'payout.failed';

export interface RewardEvent {
  readonly eventId: string;
  readonly eventType: RewardEventType;
  readonly entitlementId: string;
  readonly occurredAt: string;
  readonly payload?: {
    readonly amountMinor?: number;
    readonly reason?: string;
    readonly payoutId?: string;
  };
}

export interface PayoutRequest {
  readonly payoutId: string;
  readonly accountId: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
  readonly status: 'pending' | 'paid' | 'failed';
  readonly createdAt: string;
}

/** Adapter boundary only. Implementations require separately approved payment integrations. */
export interface PayoutProvider {
  submit(request: PayoutRequest): Promise<{ readonly providerReference: string }>;
}

export type SourceAuthorizationState = 'pending' | 'active' | 'expired' | 'revoked' | 'suspended';
export type SourcePurpose = 'search' | 'display' | 'deep_link' | 'attribution' | 'orders' | 'after_sales';

export interface SourceAuthorizationRecord {
  readonly authorizationId: string;
  readonly sourceId: string;
  readonly state: SourceAuthorizationState;
  readonly authorizedBy: string;
  readonly purposes: readonly SourcePurpose[];
  readonly fields: readonly string[];
  readonly access: readonly SourceAccess[];
  readonly countries: readonly string[];
  readonly categories: readonly string[];
  readonly cacheAllowed: boolean;
  readonly redisplayAllowed: boolean;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly evidenceReference: string;
}

export interface LaunchMarketPolicy {
  readonly policyId: string;
  readonly version: string;
  readonly marketCode: string;
  readonly jurisdiction: string;
  readonly currency: string;
  readonly timezone: string;
  readonly deliveryDestinationGranularity: 'country' | 'region' | 'postal_code';
  readonly taxRegime: string;
  readonly allowedCountries: readonly string[];
  readonly allowedCategories: readonly string[];
  readonly sourceAllowlist: readonly string[];
  readonly authorizationIds: readonly string[];
  readonly effectiveAt?: string;
  readonly expiresAt?: string;
  readonly status: 'draft' | 'active' | 'paused';
}

export type ProtectionIssueType =
  | 'order_not_synced'
  | 'delivery_delay'
  | 'delivery_loss'
  | 'price_difference'
  | 'return_window'
  | 'merchant_after_sales'
  | 'reward_missing_order'
  | 'reward_reversal';
export type ProtectionPath = 'merchant_after_sales' | 'product_reward_dispute';
export type ProtectionCaseStatus =
  | 'detected'
  | 'needs_user_action'
  | 'handed_off'
  | 'awaiting_external'
  | 'resolved'
  | 'dismissed'
  | 'expired'
  | 'failed';

export interface EvidenceBundle {
  readonly evidenceId: string;
  readonly sourceType: 'platform' | 'user_import' | 'system';
  readonly reference: string;
  readonly capturedAt: string;
  readonly freshness: 'current' | 'stale' | 'unknown';
  readonly summary?: string;
}

export interface AftercareEvent {
  readonly eventId: string;
  readonly issueType: ProtectionIssueType;
  readonly detectedAt: string;
  readonly sourceId?: string;
  readonly evidence: readonly EvidenceBundle[];
}

export interface PurchaseProtectionCase {
  readonly caseId: string;
  readonly userId: string;
  readonly orderReference?: string;
  readonly orderLineReference?: string;
  readonly marketCode: string;
  readonly sourceId?: string;
  readonly issueType: ProtectionIssueType;
  readonly path: ProtectionPath;
  readonly status: ProtectionCaseStatus;
  readonly responsibility: 'merchant' | 'platform' | 'product' | 'user' | 'unknown';
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly event: AftercareEvent;
  readonly evidence: readonly EvidenceBundle[];
  readonly nextUserAction?: string;
  readonly officialCaseId?: string;
  readonly deadlineAt?: string;
  readonly responseSlaHours?: number;
  readonly lastReminderAt?: string;
  readonly lastEscalatedAt?: string;
  readonly resolution?: string;
  readonly escalationCount: number;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export type ConsentPurpose = 'recognition' | 'personalization' | 'notifications' | 'source_access' | 'orders' | 'rewards';
export type ConsentState = 'granted' | 'revoked';

export interface ConsentRecord {
  readonly consentId: string;
  readonly userId: string;
  readonly purpose: ConsentPurpose;
  readonly policyVersion: string;
  readonly state: ConsentState;
  readonly grantedAt: string;
  readonly revokedAt?: string;
  readonly channel: 'app' | 'web' | 'system_import' | 'admin';
  readonly version: number;
}

export interface NotificationSubscription {
  readonly subscriptionId: string;
  readonly userId: string;
  readonly kind: 'task' | 'price' | 'restock' | 'logistics' | 'aftercare' | 'reward';
  readonly enabled: boolean;
  readonly quietHours?: { readonly start: string; readonly end: string };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface NotificationDelivery {
  readonly deliveryId: string;
  readonly userId: string;
  readonly kind: NotificationSubscription['kind'];
  readonly dedupeKey: string;
  readonly state: 'queued' | 'sent' | 'failed' | 'suppressed';
  readonly payload: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly sentAt?: string;
  readonly failureReason?: string;
}

export type ImportKind = 'image' | 'share' | 'url' | 'taobao_token' | 'text';
export interface UserImport {
  readonly importId: string;
  readonly userId: string;
  readonly kind: ImportKind;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sha256?: string;
  readonly content: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ClarificationQuestion {
  readonly questionId: string;
  readonly field: string;
  readonly prompt: string;
  readonly required: boolean;
  readonly informationGain: number;
  readonly options?: readonly string[];
}

export interface ClarificationState {
  readonly taskId: string;
  readonly hardConstraints: Readonly<Record<string, string>>;
  readonly preferences: Readonly<Record<string, string>>;
  readonly unknownFields: readonly string[];
  readonly questions: readonly ClarificationQuestion[];
  readonly completed: boolean;
}

export interface ExecutionPolicyDecision {
  readonly allowed: false;
  readonly reason: 'capability_unavailable' | 'confirmation_required' | 'source_not_allowlisted' | 'high_risk_category' | 'budget_exceeded' | 'cooldown_active' | 'idempotency_required';
  readonly auditRequired: true;
}

export interface ExecutionPolicyInput {
  readonly capabilityId: 'F-019';
  readonly userConfirmed: boolean;
  readonly sourceAllowlisted: boolean;
  readonly categoryLowRisk: boolean;
  readonly budgetMinor?: number;
  readonly amountMinor?: number;
  readonly cooldownElapsed: boolean;
  readonly idempotencyKey?: string;
}

export interface DashboardSummary {
  readonly userId: string;
  readonly openTaskCount: number;
  readonly pendingConfirmationCount: number;
  readonly aftercareCount: number;
  readonly notificationCount: number;
  readonly capabilityStates: readonly CapabilitySnapshot[];
  readonly generatedAt: string;
}

export interface RecommendationCandidate {
  readonly candidateId: string;
  readonly matchLevel: MatchLevel;
  readonly reasons: readonly string[];
  readonly mismatches: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly sponsored: boolean;
}

export interface OrderRecord {
  readonly orderId: string;
  readonly userId: string;
  readonly sourceId: string;
  readonly orderReference: string;
  readonly status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'unknown';
  readonly currency: string;
  readonly totalMinor?: number;
  readonly occurredAt: string;
  readonly importedAt: string;
  readonly evidenceIds: readonly string[];
  readonly version: number;
}

export interface OrderEvent {
  readonly eventId: string;
  readonly orderId: string;
  readonly type: 'created' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'unknown';
  readonly occurredAt: string;
  readonly idempotencyKey: string;
  readonly evidenceIds: readonly string[];
}

export interface OfficialHandoffConfirmation {
  readonly taskId: string;
  readonly candidateId: string;
  readonly variantId: string;
  readonly sourceId: string;
  readonly quantity: number;
  readonly budgetMinor: number;
  readonly priceConditionsAccepted: boolean;
}

export interface SandboxHandoffResult {
  readonly state: 'sandbox_only';
  readonly sourceId: string;
  readonly candidateId: string;
  readonly quantity: number;
  readonly totalCost: TotalCost;
  readonly notice: string;
}

export interface OutboundClick {
  readonly outboundId: string;
  readonly userId: string;
  readonly candidateId: string;
  readonly sourceId: string;
  readonly officialUrl: string;
  readonly quantity: number;
  readonly confirmedAt: string;
  readonly attributionState: 'not_detected' | 'tracked' | 'unavailable';
}

export interface ProviderStatus {
  readonly providerId: string;
  readonly capabilityId: CapabilityId;
  readonly state: 'available' | 'unavailable' | 'degraded';
  readonly reason?: string;
  readonly checkedAt: string;
}

