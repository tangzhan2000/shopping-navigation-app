export interface HandoffConfirmationDto {
  taskId: string;
  candidateId: string;
  variantId: string;
  sourceId: string;
  quantity: number;
  budgetMinor: number;
  priceConditionsAccepted: boolean;
}

export interface SandboxHandoffDto {
  state: 'sandbox_only';
  notice: string;
}

export type InputMode = 'text' | 'url' | 'taobao_token';

export interface RecognitionFieldDto {
  name: string;
  value: string;
  confidence: number;
  confirmedByUser: boolean;
}

export interface RecognitionTaskDto {
  taskId: string;
  userId: string;
  inputType: InputMode;
  fields: RecognitionFieldDto[];
  status: 'processing' | 'needs_confirmation' | 'confirmed' | 'failed' | 'deleted';
}

export interface CapabilityDto {
  capabilityId: string;
  state: string;
  reason?: string;
}

export interface LaunchPolicyDto {
  marketCode: string;
  currency: string;
  sourceAllowlist: string[];
  allowedCategories: string[];
}

export interface SourceDto {
  sourceId: string;
  state: string;
  purposes?: string[];
  access?: string[];
  countries?: string[];
  categories?: string[];
  effectiveAt?: string;
  expiresAt?: string;
}

export type ConsentPurpose = 'recognition' | 'personalization' | 'notifications' | 'source_access' | 'orders' | 'rewards';

export interface ConsentRecordDto {
  consentId: string;
  userId: string;
  purpose: ConsentPurpose;
  policyVersion: string;
  state: 'granted' | 'revoked';
  channel: 'app' | 'web' | 'import';
  grantedAt: string;
  revokedAt?: string;
}

export interface CatalogCandidateDto {
  candidateId: string;
  product: { productId: string; brand?: string; title: string; category: string; attributes: Record<string, string>; evidenceIds: string[] };
  variant: { variantId: string; productId: string; attributes: Record<string, string>; identifiers: Record<string, string> };
  listing: { listingId: string; sourceId: string; variantId: string; url: string; access: string; region: string; capturedAt: string };
  matchLevel: 'exact' | 'variant' | 'substitute' | 'similar' | 'unknown';
  reasons: string[];
  missingAttributes: string[];
  evidenceIds: string[];
  offer?: ComparisonResultDto['results'][number]['offer'];
  priceState: 'verified' | 'estimated' | 'stale' | 'unknown';
}

export interface CatalogResolveResponseDto {
  candidates: CatalogCandidateDto[];
  queriedSourceIds: string[];
  notice?: string;
}

export interface ComparisonResultDto {
  comparisonScope: { country: string; currency: string; quantity: number; sourceIds: string[]; memberStatus: string };
  evidencePolicy: string;
  results: Array<{ offer: { offerId: string; variantId: string; sourceId: string; availability: string; price: { capturedAt: string; expiresAt: string; priceState: string; currency: string; displayPriceMinor: number } }; totalCost: { currency: string; totalMinor: number; state: string; unknownComponents: string[] } }>;
}

export interface ProtectionCaseDto {
  caseId: string;
  status: string;
  issueType: string;
  updatedAt: string;
  nextUserAction?: string;
  event: { evidence: { summary?: string; capturedAt: string }[] };
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/u, '') ?? 'http://localhost:3000';
const demoUser = process.env.EXPO_PUBLIC_DEMO_USER_ID;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (isDevelopment && demoUser) headers['x-user-id'] = demoUser;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'network_unavailable', '无法连接服务，请检查网络后重试。');
  }
  const body = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'request_failed', body.error?.message ?? '请求未完成，请稍后重试。');
  if (body.data === undefined) throw new ApiError(response.status, 'invalid_response', '服务返回的数据不完整。');
  return body.data;
}

export const api = {
  capabilities: () => request<CapabilityDto[]>('/v1/capabilities'),
  policy: () => request<LaunchPolicyDto>('/v1/launch-policy'),
  sources: () => request<SourceDto[]>('/v1/sources'),
  consents: () => request<ConsentRecordDto[]>('/v1/consents'),
  grantConsent: (purpose: ConsentPurpose) => request<ConsentRecordDto>(`/v1/consents/${purpose}`, {
    method: 'POST', body: JSON.stringify({ policyVersion: '2026-10-01', channel: 'app' }),
  }),
  revokeConsent: (purpose: ConsentPurpose) => request<ConsentRecordDto | null>(`/v1/consents/${purpose}`, { method: 'DELETE' }),
  recognize: (inputType: InputMode, content: string) => request<RecognitionTaskDto>('/v1/recognition-tasks', {
    method: 'POST', body: JSON.stringify({ inputType, content }),
  }),
  readTask: (id: string) => request<RecognitionTaskDto>(`/v1/recognition-tasks/${encodeURIComponent(id)}`),
  confirmTask: (id: string, fields: RecognitionFieldDto[]) => request<RecognitionTaskDto>(`/v1/recognition-tasks/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ action: 'confirm', confirmedFields: fields.map((field) => field.name), fieldValues: Object.fromEntries(fields.map((field) => [field.name, field.value.trim()])) }),
  }),
  deleteTask: (id: string) => request<RecognitionTaskDto>(`/v1/recognition-tasks/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ action: 'delete' }),
  }),
  resolveCatalog: (input: { taskId: string; country: string; currency: string }) => request<CatalogResolveResponseDto>('/v1/catalog/resolve', {
    method: 'POST', body: JSON.stringify(input),
  }),
  compare: (input: { taskId: string; candidateId: string; quantity: number; currency: string; country: string }) => {
    const params = new URLSearchParams({ taskId: input.taskId, candidateId: input.candidateId, quantity: String(input.quantity), currency: input.currency, country: input.country });
    return request<ComparisonResultDto>(`/v1/compare?${params.toString()}`);
  },
  cases: () => request<ProtectionCaseDto[]>(`/v1/purchase-protection-cases?userId=${encodeURIComponent(demoUser ?? '')}`),
  prepareSandboxHandoff: (confirmation: HandoffConfirmationDto) => request<SandboxHandoffDto>('/v1/outbound/prepare', {
    method: 'POST', body: JSON.stringify(confirmation),
  }),
};

export function localDemoEnabled(): boolean { return isDevelopment && !!demoUser; }
