import type { Offer, PromotionEvidence, SourceAdapter, SourceQuery } from '@shopping-navigation/contracts';
import { querySource, type SourceAdapterPolicy, type SourceQueryAuditSink } from './source-adapter.js';

export const PRIORITY_SOURCE_IDS = {
  taobaoAlliance: 'taobao-alliance',
  pinduoduoDuoduoJinbao: 'pinduoduo-duoduo-jinbao',
} as const;

export type ProviderAvailability = 'available' | 'unavailable' | 'paused' | 'failed';

export interface SourceProviderRegistration {
  readonly sourceId: string;
  readonly availability: ProviderAvailability;
  readonly adapter?: SourceAdapter;
  readonly reason: string;
}

export interface SourceQueryResult {
  readonly sourceId: string;
  readonly status: ProviderAvailability;
  readonly offers: readonly Offer[];
  readonly reason: string;
}

export interface MultiSourceQueryResult {
  readonly results: readonly SourceQueryResult[];
  readonly offers: readonly Offer[];
}

export const unavailableProvider = (sourceId: string, reason = 'provider_not_authorized'): SourceProviderRegistration => ({
  sourceId,
  availability: 'unavailable',
  reason,
});

export const defaultUnavailableProviders: readonly SourceProviderRegistration[] = [
  unavailableProvider(PRIORITY_SOURCE_IDS.taobaoAlliance, 'taobao_api_authorization_required'),
  unavailableProvider(PRIORITY_SOURCE_IDS.pinduoduoDuoduoJinbao, 'pinduoduo_api_authorization_required'),
];

function validSubsidyEvidence(evidence: PromotionEvidence, sourceId: string, now: Date): boolean {
  if (evidence.kind !== 'subsidy' || !evidence.verified || !evidence.sourceReference.startsWith(`${sourceId}:`)) return false;
  const capturedAt = Date.parse(evidence.capturedAt);
  const expiresAt = Date.parse(evidence.expiresAt);
  return Number.isFinite(capturedAt) && Number.isFinite(expiresAt)
    && capturedAt <= now.getTime() && now.getTime() < expiresAt;
}

export function rankOffers(input: { readonly offers: readonly Offer[]; readonly now?: Date }): readonly Offer[] {
  const now = input.now ?? new Date();
  return [...input.offers].sort((left, right) => {
    const leftSubsidy = left.promotionEvidence?.some((item) => validSubsidyEvidence(item, left.sourceId, now)) ?? false;
    const rightSubsidy = right.promotionEvidence?.some((item) => validSubsidyEvidence(item, right.sourceId, now)) ?? false;
    if (leftSubsidy !== rightSubsidy) return leftSubsidy ? -1 : 1;
    return left.offerId.localeCompare(right.offerId);
  });
}

export async function querySources(input: {
  readonly providers: readonly SourceProviderRegistration[];
  readonly policies: readonly SourceAdapterPolicy[];
  readonly query: SourceQuery;
  readonly now?: Date;
  readonly audit?: SourceQueryAuditSink;
}): Promise<MultiSourceQueryResult> {
  const policyBySource = new Map(input.policies.map((policy) => [policy.sourceId, policy]));
  const results: SourceQueryResult[] = [];
  for (const provider of input.providers) {
    if (!input.query.scope.sourceIds.includes(provider.sourceId)) {
      continue;
    }
    if (provider.availability !== 'available' || !provider.adapter) {
      results.push({ sourceId: provider.sourceId, status: provider.availability, offers: [], reason: provider.reason });
      if (input.audit) await input.audit({ queryId: input.query.queryId, sourceId: provider.sourceId, status: 'rejected', reason: 'source_policy_rejected', resultCount: 0 });
      continue;
    }
    const policy = policyBySource.get(provider.sourceId);
    if (!policy) {
      results.push({ sourceId: provider.sourceId, status: 'unavailable', offers: [], reason: 'source_policy_missing' });
      if (input.audit) await input.audit({ queryId: input.query.queryId, sourceId: provider.sourceId, status: 'rejected', reason: 'source_policy_rejected', resultCount: 0 });
      continue;
    }
    try {
      const offers = await querySource(provider.adapter, policy, input.query);
      results.push({ sourceId: provider.sourceId, status: 'available', offers, reason: 'ok' });
      if (input.audit) await input.audit({ queryId: input.query.queryId, sourceId: provider.sourceId, status: 'available', reason: 'ok', resultCount: offers.length });
    } catch (error) {
      results.push({ sourceId: provider.sourceId, status: 'failed', offers: [], reason: 'provider_query_failed' });
      if (input.audit) await input.audit({ queryId: input.query.queryId, sourceId: provider.sourceId, status: 'failed', reason: 'provider_query_failed', resultCount: 0 });
    }
  }
  const offers = results.flatMap((result) => result.offers);
  return { results, offers: input.now ? rankOffers({ offers, now: input.now }) : rankOffers({ offers }) };
}
