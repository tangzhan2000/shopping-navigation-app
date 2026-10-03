import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { JsonFileConsentRepository } from './consent-store.js';
import { JsonFileLaunchPolicyRepository, type LaunchPolicyRepository } from './launch-policy-store.js';
import { fixturePolicyReader } from './fixture-policy.js';
import { InMemoryRecognitionTaskStore, JsonFileRecognitionTaskStore, type RecognitionTaskStoreLike } from './recognition-store.js';
import { InMemoryJobQueue, JsonFileJobQueue, type JobQueue } from './worker.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { InMemoryEventStore, type EventStore } from './event-store.js';
import { JsonFileEventStore } from './event-file-store.js';
import { JsonFileNotificationOutbox } from './notification-file-outbox.js';
import { PurchaseProtectionService } from './purchase-protection-service.js';
import { PurchaseProtectionScheduler } from './purchase-protection-scheduler.js';
import { appendAuditEvent, createAuditEvent, type AuditEventType } from './audit-events.js';
import type {
  LaunchMarketPolicy,
  CatalogResolveRequest,
  CanonicalProduct,
  ProductVariant,
  SourceListing,
  Offer,
  Principal,
  PurchaseProtectionCase,
  SourceAuthorizationRecord,
  SourceQuery,
  ConsentPurpose,
  OfficialHandoffConfirmation,
  SandboxHandoffResult,
} from '@shopping-navigation/contracts';
import {
  calculateTotalCost,
  createFixtureAdapter,
  defaultUnavailableProviders,
  InMemoryCapabilityRegistry,
  querySource,
  RecognitionTaskStore,
  createProtectionCase,
  transitionProtectionCase,
  ProtectionCaseError,
  assertSourceAuthorized,
  createFixtureCatalogResolver,
  LaunchPolicyError,
  InMemoryConsentRepository,
  type ConsentRepository,
  requireConsent,
  evaluateExecutionPolicy,
  buildClarificationState,
  prepareOfficialHandoff,
  OfficialHandoffError,
} from '@shopping-navigation/domain';
import {
  CaseIdempotencyConflictError,
  CaseVersionConflictError,
  InMemoryPurchaseProtectionCaseRepository,
  JsonFilePurchaseProtectionCaseRepository,
  type PurchaseProtectionCaseRepository,
} from './purchase-store.js';

const port = Number(process.env.API_PORT ?? 3000);
const capabilities = new InMemoryCapabilityRegistry();
const sourceAuthorizations: readonly SourceAuthorizationRecord[] = [{
  authorizationId: 'fixture-auth-v1', sourceId: 'fixture-shop-a', state: 'active', authorizedBy: 'local-test',
  purposes: ['search', 'display', 'deep_link'], fields: ['price', 'availability'], access: ['api'], countries: ['CN'], categories: ['general'],
  cacheAllowed: false, redisplayAllowed: true, effectiveAt: '2026-01-01T00:00:00.000Z', evidenceReference: 'test-config://fixture-auth-v1',
}];
const globalConsentRepository: ConsentRepository = process.env.NODE_ENV === 'test'
  ? new InMemoryConsentRepository()
  : new JsonFileConsentRepository(process.env.CONSENT_DATA_FILE ?? './.data/consents.json');
const defaultCaseRepository: PurchaseProtectionCaseRepository = process.env.NODE_ENV === 'test'
  ? new InMemoryPurchaseProtectionCaseRepository()
  : new JsonFilePurchaseProtectionCaseRepository(process.env.APP_DATA_FILE ?? './.data/purchase-protection-cases.json');

const fixtureOffers: readonly Offer[] = [{
  offerId: 'fixture-offer-a',
  listingId: 'fixture-listing-a',
  variantId: 'fixture-variant',
  sourceId: 'fixture-shop-a',
  evidenceId: 'fixture-evidence-a',
  price: {
    evidenceId: 'fixture-evidence-a',
    offerId: 'fixture-offer-a',
    sourceId: 'fixture-shop-a',
    capturedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-10-01T00:10:00.000Z',
    priceState: 'verified',
    currency: 'CNY',
    displayPriceMinor: 10000,
    shippingMinor: 500,
    taxMinor: 0,
    discountMinor: 0,
    sourceReference: 'fixture://fixture-shop-a/fixture-offer-a',
    ruleVersion: 'fixture-v1',
  },
  availability: 'in_stock',
  promotionIds: [],
}];
const fixtureAdapter = createFixtureAdapter({ sourceId: 'fixture-shop-a', offers: fixtureOffers });
const fixtureResolver = createFixtureCatalogResolver([{
  product: { productId: 'fixture-product', brand: 'Fixture', title: '无香洗衣液 2L', category: 'general', attributes: { volume: '2L', scent: 'unscented' }, evidenceIds: ['fixture-catalog-evidence'] },
  variant: { variantId: 'fixture-variant', productId: 'fixture-product', attributes: { volume: '2L', scent: 'unscented' }, identifiers: { sku: 'fixture-sku' } },
  listing: { listingId: 'fixture-listing-a', sourceId: 'fixture-shop-a', variantId: 'fixture-variant', url: 'https://fixture.example/products/fixture-variant', access: 'api', region: 'CN', capturedAt: '2026-10-01T00:00:00.000Z' },
  ...(fixtureOffers[0] ? { offer: fixtureOffers[0] } : {}), requiredAttributes: ['volume', 'scent'], exactQueries: ['无香洗衣液 2L', 'fixture'],
}]);
const publicIndexPath = fileURLToPath(new URL('../public/index.html', import.meta.url));

const defaultCorsOrigins = process.env.NODE_ENV === 'test'
  ? 'http://localhost:3000,http://127.0.0.1:3000,http://test.local'
  : 'http://localhost:3000,http://127.0.0.1:3000';
const allowedCorsOrigins = new Set((process.env.API_CORS_ORIGINS ?? defaultCorsOrigins)
  .split(',').map((origin) => origin.trim()).filter(Boolean));

function applySecurityHeaders(request: IncomingMessage, response: ServerResponse<IncomingMessage>): void {
  const origin = request.headers.origin;
  const requestIdHeader = request.headers['x-request-id'];
  const requestId = typeof requestIdHeader === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestIdHeader)
    ? requestIdHeader
    : crypto.randomUUID();
  if (origin && allowedCorsOrigins.has(origin)) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('x-request-id', requestId);
  response.setHeader('vary', 'Origin');
  response.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type,authorization,x-request-id');
  response.setHeader('cache-control', 'no-store');
}

function sendJson(response: ServerResponse<IncomingMessage>, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('request_too_large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON body must be an object');
  return value as Record<string, unknown>;
}

type PrincipalResolver = (request: IncomingMessage) => Principal | undefined | Promise<Principal | undefined>;

function defaultPrincipalResolver(_request: IncomingMessage): Principal | undefined {
  // A trusted resolver must be injected by the deployment (for example, after
  // verifying a session/JWT). Request headers are never an authentication source.
  return undefined;
}

async function requirePrincipal(request: IncomingMessage, response: ServerResponse<IncomingMessage>, resolver: PrincipalResolver): Promise<Principal | undefined> {
  const principal = await resolver(request);
  if (!principal || typeof principal.userId !== 'string' || principal.userId.trim() === '') {
    sendJson(response, 401, { error: { code: 'authentication_required', message: 'An authenticated principal is required' } });
    return undefined;
  }
  return principal;
}

async function dispatchAuthenticated(request: IncomingMessage, response: ServerResponse<IncomingMessage>, resolver: PrincipalResolver, handler: (principal: Principal) => Promise<void> | void): Promise<void> {
  try {
    const principal = await requirePrincipal(request, response, resolver);
    if (principal) await handler(principal);
  } catch {
    if (!response.writableEnded) sendJson(response, 500, { error: { code: 'internal_error', message: 'Unable to process the authenticated request' } });
  }
}

async function handleProtectionCases(request: IncomingMessage, response: ServerResponse<IncomingMessage>, repository: PurchaseProtectionCaseRepository, principal: Principal, policies: Pick<LaunchPolicyRepository, 'current'>, audit: (eventType: AuditEventType, aggregateType: string, aggregateId: string, payload: Readonly<Record<string, unknown>>, principal?: Principal) => Promise<void>, protectionService?: PurchaseProtectionService): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  try {
    if (request.method === 'POST' && url.pathname === '/v1/purchase-protection-cases') {
      const body = await readJson(request);
      if (typeof body.marketCode !== 'string' || typeof body.idempotencyKey !== 'string'
        || typeof body.event !== 'object' || body.event === null || typeof body.path !== 'string'
        || typeof body.responsibility !== 'string' || typeof body.riskLevel !== 'string') {
        sendJson(response, 400, { error: { code: 'validation_error', message: 'Required case fields are missing' } }); return;
      }
      const event = body.event as Record<string, unknown>;
      if (typeof event.eventId !== 'string' || typeof event.issueType !== 'string' || typeof event.detectedAt !== 'string'
        || !Number.isFinite(Date.parse(event.detectedAt)) || !Array.isArray(event.evidence)) {
        sendJson(response, 400, { error: { code: 'validation_error', message: 'Invalid aftercare event' } }); return;
      }
      const policy = await policies.current(body.marketCode);
      if (!policy || (typeof body.sourceId === 'string' && !policy.sourceAllowlist.includes(body.sourceId))) {
        sendJson(response, 403, { error: { code: 'source_not_authorized', message: 'Market or source is outside the launch policy' } }); return;
      }
      const issues = ['order_not_synced', 'delivery_delay', 'delivery_loss', 'price_difference', 'return_window', 'merchant_after_sales', 'reward_missing_order', 'reward_reversal'];
      if (!issues.includes(event.issueType) || !['merchant_after_sales', 'product_reward_dispute'].includes(body.path)) {
        sendJson(response, 400, { error: { code: 'validation_error', message: 'Unsupported issue type or case path' } }); return;
      }
      const caseRecord = createProtectionCase({
        caseId: crypto.randomUUID(), userId: principal.userId, marketCode: body.marketCode,
        ...(typeof body.sourceId === 'string' ? { sourceId: body.sourceId } : {}),
        ...(typeof body.orderReference === 'string' ? { orderReference: body.orderReference } : {}),
        ...(typeof body.orderLineReference === 'string' ? { orderLineReference: body.orderLineReference } : {}),
        event: event as unknown as PurchaseProtectionCase['event'], path: body.path as PurchaseProtectionCase['path'],
        responsibility: body.responsibility as PurchaseProtectionCase['responsibility'], riskLevel: body.riskLevel as PurchaseProtectionCase['riskLevel'],
        ...(typeof body.nextUserAction === 'string' ? { nextUserAction: body.nextUserAction } : {}),
        ...(typeof body.deadlineAt === 'string' ? { deadlineAt: body.deadlineAt } : {}),
        ...(typeof body.responseSlaHours === 'number' ? { responseSlaHours: body.responseSlaHours } : {}),
        idempotencyKey: body.idempotencyKey as string,
      });
      const result = protectionService ? await protectionService.create(caseRecord) : await repository.create(caseRecord);
      if (!protectionService) await audit('purchase_protection_case_created', 'purchase_protection_case', result.caseId, { caseId: result.caseId, caseStatus: result.status, issueType: result.event.issueType, path: result.path }, principal);
      sendJson(response, 201, { data: result }); return;
    }
    if (request.method === 'GET' && url.pathname === '/v1/purchase-protection-cases') {
      const userId = url.searchParams.get('userId');
      if (!userId) { sendJson(response, 400, { error: { code: 'validation_error', message: 'userId is required' } }); return; }
      if (userId !== principal.userId) { sendJson(response, 403, { error: { code: 'principal_mismatch', message: 'The requested user is not the authenticated principal' } }); return; }
      sendJson(response, 200, { data: await (protectionService ? protectionService.listByUser(principal.userId) : repository.listByUser(principal.userId)) }); return;
    }
    const match = url.pathname.match(/^\/v1\/purchase-protection-cases\/([^/]+)(?:\/actions)?$/);
    if (!match) { sendJson(response, 404, { error: { code: 'not_found', message: 'Case not found' } }); return; }
    const caseId = match[1] as string;
    const current = await (protectionService ? protectionService.get(caseId) : repository.get(caseId));
    if (!current) { sendJson(response, 404, { error: { code: 'case_not_found', message: 'Purchase protection case not found' } }); return; }
    if (current.userId !== principal.userId) { sendJson(response, 403, { error: { code: 'principal_mismatch', message: 'The requested case is not owned by the authenticated principal' } }); return; }
    if (request.method === 'GET') { sendJson(response, 200, { data: current }); return; }
    if (request.method === 'POST' && url.pathname.endsWith('/actions')) {
      const body = await readJson(request);
      const actions: Record<string, Exclude<PurchaseProtectionCase['status'], 'detected'>> = {
        request_user_action: 'needs_user_action', handoff: 'handed_off', mark_awaiting_external: 'awaiting_external',
        resolve: 'resolved', dismiss: 'dismissed', fail: 'failed', expire: 'expired',
      };
      const status = typeof body.action === 'string' ? actions[body.action] : undefined;
      if (!status) { sendJson(response, 400, { error: { code: 'validation_error', message: 'Unsupported case action' } }); return; }
      if (body.action === 'handoff' && (typeof body.officialCaseId !== 'string' || !body.officialCaseId.trim())) {
        sendJson(response, 400, { error: { code: 'validation_error', message: 'An official case reference is required for handoff' } }); return;
      }
      const action: Parameters<PurchaseProtectionService['act']>[1] = {
        status,
        ...(typeof body.officialCaseId === 'string' ? { officialCaseId: body.officialCaseId } : {}),
        ...(typeof body.resolution === 'string' ? { resolution: body.resolution } : {}),
        ...(typeof body.nextUserAction === 'string' ? { nextUserAction: body.nextUserAction } : {}),
        escalation: body.escalation === true,
        now: new Date(),
      };
      const stored = protectionService
        ? (await protectionService.act(caseId, action)).caseRecord
        : await repository.update(transitionProtectionCase(current, action), current.version);
      if (!protectionService) await audit('purchase_protection_case_transitioned', 'purchase_protection_case', stored.caseId, { caseId: stored.caseId, caseStatus: stored.status, issueType: stored.event.issueType, path: stored.path }, principal);
      sendJson(response, 200, { data: stored }); return;
    }
    sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found' } });
  } catch (error) {
    if (error instanceof ProtectionCaseError) { sendJson(response, 409, { error: { code: error.code, message: 'Invalid case state transition or case data' } }); return; }
    if (error instanceof CaseVersionConflictError || error instanceof CaseIdempotencyConflictError) { sendJson(response, 409, { error: { code: 'idempotency_conflict', message: 'The case conflicts with an existing version or request' } }); return; }
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'request_too_large')) { sendJson(response, 400, { error: { code: 'invalid_request', message: 'Request body is invalid' } }); return; }
    sendJson(response, 500, { error: { code: 'internal_error', message: 'Unable to process purchase protection case' } });
  }
}

async function requirePurposeConsent(repository: ConsentRepository, principal: Principal, purpose: ConsentPurpose, response: ServerResponse<IncomingMessage>): Promise<boolean> {
  try {
    requireConsent(repository, principal.userId, purpose);
    return true;
  } catch {
    sendJson(response, 403, { error: { code: 'consent_required', message: `Consent required for ${purpose}` } });
    return false;
  }
}

async function handleRecognition(request: IncomingMessage, response: ServerResponse<IncomingMessage>, principal: Principal, recognitionTasks: RecognitionTaskStoreLike, consentRepository: ConsentRepository, audit: (eventType: AuditEventType, aggregateType: string, aggregateId: string, payload: Readonly<Record<string, unknown>>, principal?: Principal) => Promise<void>): Promise<void> {
  if (!await requirePurposeConsent(consentRepository, principal, 'recognition', response)) return;
  const url = new URL(request.url ?? '/', 'http://localhost');
  try {
    if (request.method === 'POST' && url.pathname === '/v1/recognition-tasks') {
      const body = await readJson(request);
      const taskId = typeof body.taskId === 'string' ? body.taskId : crypto.randomUUID();
      const inputType = body.inputType;
      const content = body.content;
      if (!['voice', 'text', 'image', 'share', 'taobao_token', 'url'].includes(String(inputType)) || typeof content !== 'string') {
        sendJson(response, 400, { error: { code: 'invalid_recognition_input', message: 'inputType and string content are required' } });
        return;
      }
      const task = await recognitionTasks.create({
        taskId,
        userId: principal.userId,
        inputType: inputType as Parameters<RecognitionTaskStore['create']>[0]['inputType'],
        content,
      });
      await audit('task_created', 'recognition_task', task.taskId, { inputType: task.inputType, status: task.status }, principal);
      await audit('recognition_completed', 'recognition_task', task.taskId, { inputType: task.inputType, status: task.status }, principal);
      const clarification = buildClarificationState(task.taskId, task.fields.map((field) => ({ ...field, value: field.confirmedByUser ? field.value : field.name === 'query' ? field.value : '' })));
      sendJson(response, 201, { data: { ...task, clarification } });
      return;
    }

    const taskMatch = url.pathname.match(/^\/v1\/recognition-tasks\/([^/]+)$/);
    const taskId = taskMatch?.[1];
    if (taskId && request.method === 'GET') {
      const task = await recognitionTasks.get(taskId, principal.userId);
      if (!task) {
        sendJson(response, 404, { error: { code: 'recognition_task_not_found', message: 'Recognition task not found' } });
        return;
      }
      sendJson(response, 200, { data: task });
      return;
    }

    if (taskId && request.method === 'POST') {
      const body = await readJson(request);
      const existingTask = await recognitionTasks.get(taskId, principal.userId);
      if (!existingTask) {
        sendJson(response, 404, { error: { code: 'recognition_task_not_found', message: 'Recognition task not found' } });
        return;
      }
      if (body.action === 'delete') {
        const deleted = await recognitionTasks.delete(taskId, principal.userId);
        await audit('recognition_deleted', 'recognition_task', taskId, { inputType: existingTask.inputType, status: deleted.status }, principal);
        sendJson(response, 200, { data: deleted });
        return;
      }
      if (body.action === 'confirm') {
        const confirmedFields = Array.isArray(body.confirmedFields) && body.confirmedFields.every((value) => typeof value === 'string')
          ? body.confirmedFields as string[]
          : undefined;
        const fieldValues = body.fieldValues;
        if (fieldValues !== undefined && (typeof fieldValues !== 'object' || fieldValues === null || Array.isArray(fieldValues)
          || Object.values(fieldValues).some((value) => typeof value !== 'string'))) {
          sendJson(response, 400, { error: { code: 'invalid_recognition_request', message: 'fieldValues must contain string values' } });
          return;
        }
        const confirmed = await recognitionTasks.confirm(taskId, confirmedFields, principal.userId, fieldValues as Record<string, string> | undefined);
        await audit('recognition_confirmed', 'recognition_task', taskId, { inputType: existingTask.inputType, status: confirmed.status }, principal);
        sendJson(response, 200, { data: confirmed });
        return;
      }
    }
    sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found' } });
  } catch (error) {
    if ((error instanceof Error && error.name === 'RecognitionTaskError') || error instanceof SyntaxError || (error instanceof Error && ['request_too_large', 'JSON body must be an object'].includes(error.message))) {
      sendJson(response, 400, { error: { code: 'invalid_recognition_request', message: 'Invalid recognition request' } });
      return;
    }
    sendJson(response, 500, { error: { code: 'internal_error', message: 'Unable to process recognition task' } });
  }
}

async function handleCatalogResolve(request: IncomingMessage, response: ServerResponse<IncomingMessage>, principal: Principal, recognitionTasks: RecognitionTaskStoreLike, consentRepository: ConsentRepository, policies: Pick<LaunchPolicyRepository, 'current'>, audit: (eventType: AuditEventType, aggregateType: string, aggregateId: string, payload: Readonly<Record<string, unknown>>, principal?: Principal) => Promise<void>): Promise<void> {
  if (!await requirePurposeConsent(consentRepository, principal, 'recognition', response)) return;
  if (!await requirePurposeConsent(consentRepository, principal, 'source_access', response)) return;
  try {
    if (process.env.NODE_ENV !== 'test') {
      sendJson(response, 503, { error: { code: 'launch_policy_unconfigured', message: 'Catalog resolution is only available with the local fixture policy' } }); return;
    }
    const body = await readJson(request);
    if (typeof body.taskId !== 'string' || typeof body.country !== 'string' || typeof body.currency !== 'string') {
      sendJson(response, 400, { error: { code: 'invalid_catalog_resolve', message: 'A confirmed task and market are required' } }); return;
    }
    const policy = await policies.current(body.country);
    if (!policy || body.country !== policy.marketCode || body.currency !== policy.currency) {
      sendJson(response, 403, { error: { code: 'launch_policy_unconfigured', message: 'No approved launch policy is active for this market' } }); return;
    }
    const task = await recognitionTasks.get(body.taskId, principal.userId);
    if (!task || task.userId !== principal.userId || task.status !== 'confirmed' || task.fields.some((field) => !field.confirmedByUser)) {
      sendJson(response, 409, { error: { code: 'identity_confirmation_required', message: 'The recognition task must be fully confirmed before catalog resolution' } }); return;
    }
    const quantityField = task.fields.find((field) => field.name === 'quantity');
    const quantity = quantityField ? Number(quantityField.value) : 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      sendJson(response, 400, { error: { code: 'invalid_catalog_resolve', message: 'The confirmed task quantity must be a positive integer' } }); return;
    }
    const queryField = task.fields.find((field) => field.name === 'query');
    const urlField = task.fields.find((field) => field.name === 'url');
    const input: CatalogResolveRequest = {
      taskId: task.taskId, ...(queryField ? { query: queryField.value } : {}), ...(urlField ? { url: urlField.value } : {}),
      country: body.country, currency: body.currency, quantity,
    };
    await audit('cross_source_search_started', 'recognition_task', task.taskId, { sourceIds: ['fixture-shop-a'], status: 'started' }, principal);
    const resolved = fixtureResolver.resolve(input);
    await audit('cross_source_search_completed', 'recognition_task', task.taskId, { sourceIds: ['fixture-shop-a'], resultCount: resolved.candidates.length, status: 'completed' }, principal);
    sendJson(response, 200, { data: resolved });
  } catch (error) {
    sendJson(response, 400, { error: { code: 'invalid_catalog_resolve', message: 'Invalid catalog resolve request' } });
  }
}

async function handleHandoff(request: IncomingMessage, response: ServerResponse<IncomingMessage>, principal: Principal, recognitionTasks: RecognitionTaskStoreLike, consentRepository: ConsentRepository, policies: Pick<LaunchPolicyRepository, 'current'>, now: Date = new Date(), audit?: (eventType: AuditEventType, aggregateType: string, aggregateId: string, payload: Readonly<Record<string, unknown>>, principal?: Principal) => Promise<void>): Promise<void> {
  if (!await requirePurposeConsent(consentRepository, principal, 'recognition', response)) return;
  if (!await requirePurposeConsent(consentRepository, principal, 'source_access', response)) return;
  if (process.env.NODE_ENV !== 'test') {
    sendJson(response, 503, { error: { code: 'official_handoff_unavailable', message: 'An authorized production source and official host allowlist are required' } }); return;
  }
  let auditTaskId: string | undefined;
  try {
    const body = await readJson(request);
    auditTaskId = typeof body.taskId === 'string' ? body.taskId : undefined;
    if (typeof body.taskId !== 'string' || typeof body.candidateId !== 'string' || typeof body.variantId !== 'string'
      || typeof body.sourceId !== 'string' || typeof body.quantity !== 'number' || typeof body.budgetMinor !== 'number'
      || body.priceConditionsAccepted !== true) {
      sendJson(response, 400, { error: { code: 'confirmation_required', message: 'Confirm product, variant, source, quantity, budget and price conditions' } }); return;
    }
    const confirmation: OfficialHandoffConfirmation = {
      taskId: body.taskId, candidateId: body.candidateId, variantId: body.variantId,
      sourceId: body.sourceId, quantity: body.quantity, budgetMinor: body.budgetMinor,
      priceConditionsAccepted: true,
    };
    const task = await recognitionTasks.get(confirmation.taskId, principal.userId);
    if (!task || task.status !== 'confirmed' || task.fields.some((field) => !field.confirmedByUser)) {
      sendJson(response, 409, { error: { code: 'identity_confirmation_required', message: 'An owned, fully confirmed task is required' } }); return;
    }
    const quantity = Number(task.fields.find((field) => field.name === 'quantity')?.value ?? '1');
    const query = task.fields.find((field) => field.name === 'query')?.value;
    const url = task.fields.find((field) => field.name === 'url')?.value;
    const resolved = fixtureResolver.resolve({ taskId: task.taskId, ...(query ? { query } : {}), ...(url ? { url } : {}), country: 'CN', currency: 'CNY', quantity });
    const candidate = resolved.candidates.find((item) => item.candidateId === body.candidateId);
    if (!candidate?.offer) {
      sendJson(response, 409, { error: { code: 'candidate_not_verified', message: 'No evidence-backed candidate is available' } }); return;
    }
    const totalCost = calculateTotalCost({ offer: candidate.offer, currency: 'CNY', quantity, now });
    const policy = await policies.current('CN', now);
    if (!policy) {
      sendJson(response, 503, { error: { code: 'launch_policy_unconfigured', message: 'No approved launch policy is active' } }); return;
    }
    prepareOfficialHandoff({ candidate, totalCost, quantity, currency: 'CNY', country: 'CN', policy,
      authorization: sourceAuthorizations[0], officialHosts: ['fixture.example'], now,
      confirmed: { candidateId: confirmation.candidateId, variantId: confirmation.variantId, sourceId: confirmation.sourceId,
        quantity: confirmation.quantity, budgetMinor: confirmation.budgetMinor, priceConditionsAccepted: confirmation.priceConditionsAccepted } });
    const result: SandboxHandoffResult = { state: 'sandbox_only', sourceId: candidate.listing.sourceId,
      candidateId: candidate.candidateId, quantity, totalCost,
      notice: 'Fixture validation passed; no official link was opened and no order or attribution was created.' };
    await audit?.('official_outbound_clicked', 'recognition_task', task.taskId, { status: 'sandbox_only', sourceId: candidate.listing.sourceId }, principal);
    sendJson(response, 200, { data: result });
  } catch (error) {
    if (error instanceof OfficialHandoffError) {
      await audit?.('official_outbound_failed', 'recognition_task', auditTaskId ?? 'unknown', { status: 'failed', errorCategory: error.code }, principal);
      sendJson(response, 409, { error: { code: error.code, message: 'Official handoff validation failed' } }); return;
    }
    await audit?.('official_outbound_failed', 'recognition_task', auditTaskId ?? 'unknown', { status: 'failed', errorCategory: 'invalid_handoff' }, principal);
    sendJson(response, 400, { error: { code: 'invalid_handoff', message: 'Invalid handoff request' } });
  }
}

async function handleCompare(requestUrl: string, response: ServerResponse<IncomingMessage>, principal: Principal, recognitionTasks: RecognitionTaskStoreLike, consentRepository: ConsentRepository, policies: Pick<LaunchPolicyRepository, 'current'>, now: Date = new Date(), audit?: (eventType: AuditEventType, aggregateType: string, aggregateId: string, payload: Readonly<Record<string, unknown>>, principal?: Principal) => Promise<void>): Promise<void> {
  if (!await requirePurposeConsent(consentRepository, principal, 'recognition', response)) return;
  if (!await requirePurposeConsent(consentRepository, principal, 'source_access', response)) return;
  const url = new URL(requestUrl, 'http://localhost');
  const taskId = url.searchParams.get('taskId')?.trim();
  const candidateId = url.searchParams.get('candidateId')?.trim();
  if (!taskId || !candidateId) {
    sendJson(response, 400, { error: { code: 'confirmed_candidate_required', message: 'A confirmed taskId and candidateId are required for comparison' } });
    return;
  }
  const currency = url.searchParams.get('currency') ?? 'CNY';
  const country = url.searchParams.get('country') ?? 'CN';
  const requestedQuantity = Number(url.searchParams.get('quantity') ?? '1');

  try {
    if (process.env.NODE_ENV !== 'test') {
      sendJson(response, 503, { error: { code: 'launch_policy_unconfigured', message: 'A production launch policy must be explicitly configured before comparison' } });
      return;
    }
    const task = await recognitionTasks.get(taskId, principal.userId);
    if (!task || task.status !== 'confirmed' || task.fields.some((field) => !field.confirmedByUser)) {
      sendJson(response, 409, { error: { code: 'identity_confirmation_required', message: 'The recognition task must be fully confirmed before comparison' } });
      return;
    }
    const quantityField = task.fields.find((field) => field.name === 'quantity');
    const quantity = quantityField ? Number(quantityField.value) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || requestedQuantity !== quantity) {
      sendJson(response, 400, { error: { code: 'confirmed_quantity_mismatch', message: 'Comparison quantity must match the confirmed recognition task' } });
      return;
    }
    if (country !== 'CN' || currency !== 'CNY') {
      sendJson(response, 400, { error: { code: 'unsupported_comparison_scope', message: 'Only the confirmed CN/CNY comparison scope is available' } });
      return;
    }
    const queryField = task.fields.find((field) => field.name === 'query');
    const urlField = task.fields.find((field) => field.name === 'url');
    const resolved = fixtureResolver.resolve({
      taskId: task.taskId,
      ...(queryField ? { query: queryField.value } : {}),
      ...(urlField ? { url: urlField.value } : {}),
      country, currency, quantity,
    });
    const candidate = resolved.candidates.find((item) => item.candidateId === candidateId);
    if (!candidate || (candidate.matchLevel !== 'exact' && candidate.matchLevel !== 'variant')) {
      sendJson(response, 409, { error: { code: 'verified_candidate_required', message: 'Only an exact or variant-matched candidate can be compared' } });
      return;
    }
    const variantId = candidate.variant.variantId;
    const sourceQuery: SourceQuery = {
      queryId: crypto.randomUUID(),
      variantId,
      scope: { country, currency, quantity, sourceIds: ['fixture-shop-a'], memberStatus: 'unknown' },
    };
    await audit?.('cross_source_search_started', 'comparison', sourceQuery.queryId, { sourceIds: sourceQuery.scope.sourceIds, status: 'started' }, principal);
    const policy = await policies.current(country, now);
    if (!policy) {
      sendJson(response, 503, { error: { code: 'launch_policy_unconfigured', message: 'No approved launch policy is active' } }); return;
    }
    assertSourceAuthorized(policy, sourceAuthorizations[0], {
      marketCode: 'CN', country, category: 'general', sourceId: 'fixture-shop-a', purpose: 'search', now,
    });
    const offers = await querySource(fixtureAdapter, {
      sourceId: 'fixture-shop-a', enabled: true, allowedAccess: ['api'], maxResults: 20,
    }, sourceQuery);
    const results = offers.map((offer) => ({ offer, totalCost: calculateTotalCost({ offer, quantity, currency, now }) }));
    await audit?.('cross_source_search_completed', 'comparison', sourceQuery.queryId, { sourceIds: sourceQuery.scope.sourceIds, resultCount: results.length, status: 'completed' }, principal);
    sendJson(response, 200, {
      data: {
        comparisonScope: sourceQuery.scope,
        evidencePolicy: 'Prices are only asserted within the returned source and capture window.',
        coverage: {
          queriedSourceIds: ['fixture-shop-a'],
          unavailableSourceIds: defaultUnavailableProviders.map((provider) => provider.sourceId),
          notice: 'Only fixture data was queried; Taobao Alliance and Pinduoduo are unavailable until API authorization.',
        },
        results,
      },
    });
  } catch (error) {
    await audit?.('source_query_failed', 'comparison', taskId, { status: 'failed', errorCategory: error instanceof Error ? error.name : 'unknown' }, principal);
    if (error instanceof LaunchPolicyError) {
      sendJson(response, 403, { error: { code: error.code, message: 'The requested source is outside the authorized launch scope' } });
      return;
    }
    sendJson(response, 400, { error: { code: 'invalid_comparison', message: 'Invalid comparison request' } });
  }
}

export type ApiRequestHandler = (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => void;

interface ApiOptions {
  readonly caseRepository?: PurchaseProtectionCaseRepository;
  readonly principalResolver?: PrincipalResolver;
  readonly recognitionTasks?: RecognitionTaskStoreLike;
  readonly consentRepository?: ConsentRepository;
  readonly policyReader?: Pick<LaunchPolicyRepository, 'current'>;
  readonly now?: () => Date;
  readonly eventStore?: EventStore;
  readonly notificationOutbox?: JsonFileNotificationOutbox;
  readonly jobQueue?: JobQueue;
  readonly protectionService?: PurchaseProtectionService;
}

export function createApiHandler(options: ApiOptions = {}): ApiRequestHandler {
  const caseRepository = options.caseRepository ?? defaultCaseRepository;
  const principalResolver = options.principalResolver ?? defaultPrincipalResolver;
  const consentRepository = options.consentRepository ?? globalConsentRepository;
  const recognitionTasks = options.recognitionTasks ?? (process.env.NODE_ENV === 'test' ? new InMemoryRecognitionTaskStore() : new JsonFileRecognitionTaskStore(process.env.APP_DATA_RECOGNITION_FILE ?? './.data/recognition-tasks.json'));
  const policyReader = options.policyReader ?? (process.env.NODE_ENV === 'test'
    ? fixturePolicyReader : new JsonFileLaunchPolicyRepository(process.env.LAUNCH_POLICY_DATA_FILE ?? './.data/launch-policy.json'));
  const now = options.now ?? (() => process.env.NODE_ENV === 'test' ? new Date('2026-10-01T00:05:00.000Z') : new Date());
  const eventStore = options.eventStore ?? (process.env.NODE_ENV === 'test'
    ? new InMemoryEventStore()
    : new JsonFileEventStore(process.env.APP_DATA_EVENTS_FILE ?? './.data/events.json'));
  const notificationOutbox = options.notificationOutbox ?? new JsonFileNotificationOutbox(process.env.APP_DATA_NOTIFICATIONS_FILE ?? './.data/notifications.json');
  const jobQueue = options.jobQueue ?? (process.env.NODE_ENV === 'test'
    ? new InMemoryJobQueue()
    : new JsonFileJobQueue(process.env.APP_DATA_JOBS_FILE ?? './.data/jobs.json'));
  const protectionService = options.protectionService ?? new PurchaseProtectionService({ repository: caseRepository, eventStore, notificationOutbox, jobQueue, now });
  const scheduler = new PurchaseProtectionScheduler({ service: protectionService, queue: jobQueue });
  const appendAudit = async (eventType: AuditEventType, aggregateType: string, aggregateId: string, payload: Readonly<Record<string, unknown>>, principal?: Principal): Promise<void> => {
    try {
      await appendAuditEvent(eventStore, createAuditEvent({
        eventId: crypto.randomUUID(), eventType, aggregateType, aggregateId,
        correlationId: crypto.randomUUID(), occurredAt: now(), actorType: principal ? 'user' : 'system', payload,
      }));
    } catch {
      // Audit persistence is isolated from the user-facing business result.
    }
  };
  return (request, response) => {
  const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname;
  applySecurityHeaders(request, response);
  if (request.method === 'OPTIONS') {
    const origin = request.headers.origin;
    if (origin && !allowedCorsOrigins.has(origin)) { sendJson(response, 403, { error: { code: 'origin_not_allowed', message: 'Origin is not allowed' } }); return; }
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
    void readFile(publicIndexPath).then((html) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(html);
    }).catch(() => sendJson(response, 404, { error: { code: 'not_found', message: 'Client not found' } }));
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && request.url === '/v1/capabilities') {
    sendJson(response, 200, { data: capabilities.list() });
    return;
  }
  if (request.method === 'GET' && requestPath === '/v1/audit/events') {
    void dispatchAuthenticated(request, response, principalResolver, async (principal) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const aggregateId = url.searchParams.get('aggregateId') ?? undefined;
      const eventType = url.searchParams.get('eventType') ?? undefined;
      const events = (await eventStore.list(aggregateId)).filter((event) => eventType === undefined || event.eventType === eventType)
        .filter((event) => event.metadata.actorType === 'system' || event.metadata.actorType === 'user');
      // Keep this local/test-only until an authenticated admin boundary exists.
      if (process.env.NODE_ENV !== 'test') { sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found' } }); return; }
      void principal;
      sendJson(response, 200, { data: events });
    });
    return;
  }
  if (request.method === 'GET' && request.url === '/v1/launch-policy') {
    void policyReader.current('CN').then((policy) => {
      if (!policy) { sendJson(response, 503, { error: { code: 'launch_policy_unconfigured', message: 'No approved launch policy is active' } }); return; }
      sendJson(response, 200, { data: policy });
    }).catch(() => sendJson(response, 500, { error: { code: 'internal_error', message: 'Unable to read launch policy' } }));
    return;
  }
  if (request.method === 'GET' && request.url === '/v1/sources') {
    sendJson(response, 200, { data: sourceAuthorizations.map(({ authorizationId, sourceId, state, purposes, access, countries, categories, effectiveAt, expiresAt }) => ({ authorizationId, sourceId, state, purposes, access, countries, categories, effectiveAt, ...(expiresAt === undefined ? {} : { expiresAt }) })) });
    return;
  }
  if (request.method === 'POST' && request.url === '/v1/execution-policy/evaluate') {
    void dispatchAuthenticated(request, response, principalResolver, async (principal) => {
      try {
        const body = await readJson(request);
        const decision = evaluateExecutionPolicy({
          capabilityId: 'F-019', userConfirmed: body.userConfirmed === true, sourceAllowlisted: body.sourceAllowlisted === true,
          categoryLowRisk: body.categoryLowRisk === true, cooldownElapsed: body.cooldownElapsed === true,
          ...(typeof body.budgetMinor === 'number' ? { budgetMinor: body.budgetMinor } : {}),
          ...(typeof body.amountMinor === 'number' ? { amountMinor: body.amountMinor } : {}),
          ...(typeof body.idempotencyKey === 'string' ? { idempotencyKey: body.idempotencyKey } : {}),
        }, false);
        sendJson(response, 200, { data: { ...decision, userId: principal.userId } });
      } catch { sendJson(response, 400, { error: { code: 'invalid_execution_policy', message: 'Invalid execution policy request' } }); }
    });
    return;
  }
  if (requestPath === '/v1/consents' || requestPath.startsWith('/v1/consents/')) {
    void dispatchAuthenticated(request, response, principalResolver, async (principal) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      try {
        if (request.method === 'GET') { sendJson(response, 200, { data: consentRepository.list(principal.userId) }); return; }
        const pathPurpose = url.pathname.match(/^\/v1\/consents\/([^/]+)$/u)?.[1];
        const body = await readJson(request);
        const purpose = (typeof pathPurpose === 'string' ? pathPurpose : typeof body.purpose === 'string' ? body.purpose : undefined) as ConsentPurpose | undefined;
        if (!purpose || !['recognition', 'personalization', 'notifications', 'source_access', 'orders', 'rewards'].includes(purpose)) { sendJson(response, 400, { error: { code: 'invalid_consent', message: 'A valid consent purpose is required' } }); return; }
        if (request.method === 'POST') {
          const record = consentRepository.grant({ userId: principal.userId, purpose, policyVersion: typeof body.policyVersion === 'string' ? body.policyVersion : 'v1', channel: body.channel === 'web' ? 'web' : 'app' });
          await appendAudit('consent_granted', 'consent', `${principal.userId}:${purpose}`, { consentPurpose: purpose, status: record.state }, principal);
          sendJson(response, 201, { data: record }); return;
        }
        if (request.method === 'DELETE') {
          const record = consentRepository.revoke(principal.userId, purpose);
          await appendAudit('consent_revoked', 'consent', `${principal.userId}:${purpose}`, { consentPurpose: purpose, status: record?.state ?? 'revoked' }, principal);
          sendJson(response, 200, { data: record ?? null }); return;
        }
        sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed' } });
      } catch { sendJson(response, 400, { error: { code: 'invalid_consent', message: 'Invalid consent request' } }); }
    });
    return;
  }
  if (requestPath === '/v1/purchase-protection-cases' || requestPath.startsWith('/v1/purchase-protection-cases/')) {
    void dispatchAuthenticated(request, response, principalResolver, (principal) => handleProtectionCases(request, response, caseRepository, principal, policyReader, appendAudit, protectionService));
    return;
  }
  if (requestPath === '/v1/recognition-tasks' || requestPath.startsWith('/v1/recognition-tasks/')) {
    void dispatchAuthenticated(request, response, principalResolver, (principal) => handleRecognition(request, response, principal, recognitionTasks, consentRepository, appendAudit));
    return;
  }
  if (request.method === 'POST' && request.url === '/v1/catalog/resolve') {
    void dispatchAuthenticated(request, response, principalResolver, (principal) => handleCatalogResolve(request, response, principal, recognitionTasks, consentRepository, policyReader, appendAudit));
    return;
  }
  if (request.method === 'GET' && ['/v1/orders', '/v1/recommendations', '/v1/reminders'].includes(request.url ?? '')) {
    void dispatchAuthenticated(request, response, principalResolver, () => {
      const capabilityId = request.url === '/v1/orders' ? 'F-016' : request.url === '/v1/recommendations' ? 'F-010' : 'F-015';
      const capability = capabilities.get(capabilityId);
      sendJson(response, 503, { error: { code: 'capability_unavailable', message: `${capabilityId} is not connected to an authorized provider` }, capability: { capabilityId, state: capability.state } });
    });
    return;
  }
  if (request.method === 'POST' && ['/v1/payouts', '/v1/purchases/execute'].includes(request.url ?? '')) {
    void dispatchAuthenticated(request, response, principalResolver, () => {
      const capabilityId = request.url === '/v1/payouts' ? 'F-018' : 'F-019';
      const capability = capabilities.get(capabilityId);
      sendJson(response, 503, { error: { code: 'capability_unavailable', message: `${capabilityId} requires independent authorization and cannot execute` }, capability: { capabilityId, state: capability.state } });
    });
    return;
  }
  if (request.method === 'POST' && request.url === '/v1/outbound/prepare') {
    void dispatchAuthenticated(request, response, principalResolver, (principal) => handleHandoff(request, response, principal, recognitionTasks, consentRepository, policyReader, now(), appendAudit));
    return;
  }
  if (request.method === 'GET' && requestPath === '/v1/compare') {
    void dispatchAuthenticated(request, response, principalResolver, (principal) => handleCompare(request.url!, response, principal, recognitionTasks, consentRepository, policyReader, now(), appendAudit));
    return;
  }
  sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found' } });
  };
}

export function createApiServer(options: ApiOptions = {}) {
  return createServer(createApiHandler(options));
}

if (process.env.NODE_ENV !== 'test') {
  const server = createApiServer();
  server.listen(port, () => {
    console.log(`shopping-navigation API listening on ${port}`);
  });
}
