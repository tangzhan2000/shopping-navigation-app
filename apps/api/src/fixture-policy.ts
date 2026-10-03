import type { LaunchMarketPolicy } from '@shopping-navigation/contracts';
import type { LaunchPolicyRepository } from './launch-policy-store.js';

export const fixtureLaunchPolicy: LaunchMarketPolicy = {
  policyId: 'launch-cn-v1', version: '1', marketCode: 'CN', jurisdiction: 'CN', currency: 'CNY', timezone: 'Asia/Shanghai',
  deliveryDestinationGranularity: 'country', taxRegime: 'consumer-included', allowedCountries: ['CN'], allowedCategories: ['general'],
  sourceAllowlist: ['fixture-shop-a'], authorizationIds: ['fixture-auth-v1'], status: 'active',
};

export const fixturePolicyReader: Pick<LaunchPolicyRepository, 'current'> = {
  current: async (marketCode) => marketCode === 'CN' ? structuredClone(fixtureLaunchPolicy) : undefined,
};
