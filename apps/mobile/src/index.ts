export type MobileInputType = 'voice' | 'text' | 'image' | 'share' | 'taobao_token' | 'url';
export type MatchLevel = 'exact' | 'variant' | 'substitute' | 'similar' | 'unknown';
export interface RecognitionField {
  readonly name: string;
  readonly value: string;
  readonly confidence: number;
  readonly confirmedByUser: boolean;
}
export interface ComparisonScope {
  readonly country: string;
  readonly currency: string;
  readonly quantity: number;
  readonly sourceIds: readonly string[];
  readonly memberStatus: 'member' | 'non_member' | 'unknown';
  readonly deliveryDeadline?: string;
}

export interface MobileShell {
  readonly name: 'shopping-navigation-mobile';
  readonly inputModes: readonly MobileInputType[];
}

export const mobileShell: MobileShell = {
  name: 'shopping-navigation-mobile',
  inputModes: ['voice', 'text', 'image', 'share', 'taobao_token', 'url'],
};

export type JourneyStage = 'input' | 'confirmation' | 'candidates' | 'comparison' | 'official_fallback';
export type JourneyCapability = 'voice' | 'ocr' | 'platform_execution';
export type UnavailableReason = 'not_implemented' | 'permission_required' | 'unsupported_platform' | 'not_configured';

export type CapabilityAvailability =
  | { readonly status: 'available' }
  | { readonly status: 'unavailable'; readonly reason: UnavailableReason; readonly fallback: string };

export type JourneyCapabilities = Readonly<Record<JourneyCapability, CapabilityAvailability>>;

export const defaultJourneyCapabilities: JourneyCapabilities = {
  voice: { status: 'unavailable', reason: 'not_implemented', fallback: 'text' },
  ocr: { status: 'unavailable', reason: 'not_implemented', fallback: 'text' },
  platform_execution: { status: 'unavailable', reason: 'not_implemented', fallback: 'manual_official_open' },
};

export interface JourneyInput {
  readonly inputType: MobileInputType;
  readonly content: string;
}

export interface JourneyCandidate {
  readonly candidateId: string;
  readonly productId?: string;
  readonly title: string;
  readonly matchLevel: MatchLevel;
  readonly reasons: readonly string[];
  readonly caveats: readonly string[];
  readonly sourceId: string;
  readonly officialUrl: string;
  readonly priceState: 'verified' | 'estimated' | 'stale' | 'unknown';
  readonly totalCost?: { readonly currency: string; readonly totalMinor: number };
}

export interface CandidateSet {
  readonly candidates: readonly JourneyCandidate[];
  readonly scope: ComparisonScope;
  readonly coverage: { readonly queriedSourceIds: readonly string[]; readonly unavailableSourceIds: readonly string[] };
  readonly notice?: string;
}

interface JourneyBase {
  readonly journeyId: string;
  readonly capabilities: JourneyCapabilities;
  readonly revision: number;
}

export interface InputState extends JourneyBase {
  readonly stage: 'input';
  readonly input?: JourneyInput;
  readonly error?: { readonly code: 'empty_input' | 'unavailable_input'; readonly message: string; readonly fallback: string };
}

export interface ConfirmationState extends JourneyBase {
  readonly stage: 'confirmation';
  readonly input: JourneyInput;
  readonly fields: readonly RecognitionField[];
}

export interface CandidatesState extends JourneyBase {
  readonly stage: 'candidates';
  readonly input: JourneyInput;
  readonly confirmedFields: readonly RecognitionField[];
  readonly result: CandidateSet;
}

export interface ComparisonState extends JourneyBase {
  readonly stage: 'comparison';
  readonly input: JourneyInput;
  readonly confirmedFields: readonly RecognitionField[];
  readonly result: CandidateSet;
  readonly selectedCandidateId: string;
}

export interface OfficialFallbackState extends JourneyBase {
  readonly stage: 'official_fallback';
  readonly input: JourneyInput;
  readonly confirmedFields: readonly RecognitionField[];
  readonly result: CandidateSet;
  readonly candidate: JourneyCandidate;
  readonly handoff: {
    readonly status: 'ready_for_user';
    readonly officialUrl: string;
    readonly execution: CapabilityAvailability;
  };
}

export type DecisionJourneyState = InputState | ConfirmationState | CandidatesState | ComparisonState | OfficialFallbackState;

export type DecisionJourneyAction =
  | { readonly type: 'submit_input'; readonly input: JourneyInput }
  | { readonly type: 'recognition_completed'; readonly fields: readonly RecognitionField[] }
  | { readonly type: 'edit_field'; readonly name: string; readonly value: string }
  | { readonly type: 'confirm_input' }
  | { readonly type: 'candidates_loaded'; readonly result: CandidateSet }
  | { readonly type: 'select_candidate'; readonly candidateId: string }
  | { readonly type: 'open_official'; readonly candidateId?: string }
  | { readonly type: 'return_to_input' };

export class InvalidJourneyTransitionError extends Error {
  public constructor(stage: JourneyStage, action: DecisionJourneyAction['type']) {
    super(`Action ${action} is not valid in journey stage ${stage}`);
    this.name = 'InvalidJourneyTransitionError';
  }
}

export function createDecisionJourney(input: {
  readonly journeyId: string;
  readonly capabilities?: JourneyCapabilities;
}): InputState {
  if (!input.journeyId.trim()) throw new Error('journeyId is required');
  return { stage: 'input', journeyId: input.journeyId, revision: 0, capabilities: input.capabilities ?? defaultJourneyCapabilities };
}

/** Pure reducer: platform APIs, networking and navigation are supplied by the host application. */
export function transitionJourney(state: DecisionJourneyState, action: DecisionJourneyAction): DecisionJourneyState {
  const next = <T extends DecisionJourneyState>(value: T): T => ({ ...value, revision: state.revision + 1 });
  switch (action.type) {
    case 'submit_input': {
      const content = action.input.content.trim();
      if (!content) return next({ ...state, stage: 'input', input: action.input, error: { code: 'empty_input', message: 'Enter a product or shopping request.', fallback: 'text' } });
      const unavailable = action.input.inputType === 'voice' ? state.capabilities.voice
        : action.input.inputType === 'image' ? state.capabilities.ocr : undefined;
      if (unavailable && unavailable.status === 'unavailable') {
        return next({ ...state, stage: 'input', input: action.input, error: { code: 'unavailable_input', message: `${action.input.inputType} input is unavailable: ${unavailable.reason}`, fallback: unavailable.fallback } });
      }
      const input = { ...action.input, content };
      return next({ stage: 'confirmation', journeyId: state.journeyId, capabilities: state.capabilities, input, fields: recognizeJourneyInput(input), revision: state.revision + 1 });
    }
    case 'recognition_completed':
      if (state.stage !== 'confirmation') throw new InvalidJourneyTransitionError(state.stage, action.type);
      return next({ ...state, fields: normalizeFields(action.fields) });
    case 'edit_field':
      if (state.stage !== 'confirmation') throw new InvalidJourneyTransitionError(state.stage, action.type);
      if (!state.fields.some((field) => field.name === action.name)) throw new Error(`Unknown recognition field ${action.name}`);
      return next({ ...state, fields: state.fields.map((field) => field.name === action.name ? { ...field, value: action.value, confirmedByUser: false } : field) });
    case 'confirm_input':
      if (state.stage !== 'confirmation') throw new InvalidJourneyTransitionError(state.stage, action.type);
      if (state.fields.length === 0 || state.fields.some((field) => !field.value.trim())) throw new Error('Recognition fields must be non-empty before confirmation');
      return next({ stage: 'candidates', journeyId: state.journeyId, capabilities: state.capabilities, input: state.input, confirmedFields: state.fields.map((field) => ({ ...field, confirmedByUser: true })), result: { candidates: [], scope: { country: '', currency: '', quantity: 1, sourceIds: [], memberStatus: 'unknown' }, coverage: { queriedSourceIds: [], unavailableSourceIds: [] } }, revision: state.revision + 1 });
    case 'candidates_loaded':
      if (state.stage !== 'candidates') throw new InvalidJourneyTransitionError(state.stage, action.type);
      return next({ ...state, result: validateCandidateSet(action.result) });
    case 'select_candidate':
      if (state.stage !== 'candidates') throw new InvalidJourneyTransitionError(state.stage, action.type);
      if (!state.result.candidates.some((candidate) => candidate.candidateId === action.candidateId)) throw new Error(`Unknown candidate ${action.candidateId}`);
      return next({ stage: 'comparison', journeyId: state.journeyId, capabilities: state.capabilities, input: state.input, confirmedFields: state.confirmedFields, result: state.result, selectedCandidateId: action.candidateId, revision: state.revision + 1 });
    case 'open_official': {
      if (state.stage !== 'comparison' && state.stage !== 'candidates') throw new InvalidJourneyTransitionError(state.stage, action.type);
      const candidateId = action.candidateId ?? (state.stage === 'comparison' ? state.selectedCandidateId : undefined);
      const candidate = candidateId ? state.result.candidates.find((item) => item.candidateId === candidateId) : undefined;
      if (!candidate) throw new Error('Select a candidate before opening its official listing');
      return next({ stage: 'official_fallback', journeyId: state.journeyId, capabilities: state.capabilities, input: state.input, confirmedFields: state.confirmedFields, result: state.result, candidate, handoff: { status: 'ready_for_user', officialUrl: validateOfficialUrl(candidate.officialUrl), execution: state.capabilities.platform_execution }, revision: state.revision + 1 });
    }
    case 'return_to_input':
      return next(createDecisionJourney({ journeyId: state.journeyId, capabilities: state.capabilities }));
    default: return assertNever(action);
  }
}

export function recognizeJourneyInput(input: JourneyInput): readonly RecognitionField[] {
  const content = input.content.trim();
  if (!content) return [];
  if (input.inputType === 'url' || /^https?:\/\//iu.test(content)) {
    try {
      const url = new URL(content);
      return normalizeFields([{ name: 'url', value: url.toString(), confidence: 1, confirmedByUser: false }, { name: 'sourceHost', value: url.hostname, confidence: 1, confirmedByUser: false }]);
    } catch { return []; }
  }
  if (input.inputType === 'taobao_token') return [{ name: 'taobaoToken', value: content, confidence: 1, confirmedByUser: false }];
  return [{ name: 'query', value: content, confidence: 1, confirmedByUser: false }];
}

function normalizeFields(fields: readonly RecognitionField[]): readonly RecognitionField[] {
  const names = new Set<string>();
  return fields.map((field) => {
    const name = field.name.trim();
    if (!name || names.has(name)) throw new Error(`Recognition field names must be unique and non-empty: ${name}`);
    if (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) throw new Error(`Invalid confidence for field ${name}`);
    names.add(name);
    return { ...field, name, value: field.value.trim() };
  });
}

function validateCandidateSet(result: CandidateSet): CandidateSet {
  const ids = new Set<string>();
  for (const candidate of result.candidates) {
    if (!candidate.candidateId.trim() || !candidate.title.trim() || !candidate.sourceId.trim()) throw new Error('Candidate identity and source are required');
    if (ids.has(candidate.candidateId)) throw new Error(`Duplicate candidate ${candidate.candidateId}`);
    ids.add(candidate.candidateId);
    validateOfficialUrl(candidate.officialUrl, false);
    if (candidate.totalCost && (!Number.isFinite(candidate.totalCost.totalMinor) || candidate.totalCost.totalMinor < 0 || !candidate.totalCost.currency.trim())) throw new Error(`Invalid total cost for candidate ${candidate.candidateId}`);
  }
  if (!Number.isInteger(result.scope.quantity) || result.scope.quantity < 1) throw new Error('Comparison quantity must be a positive integer');
  return result;
}

function validateOfficialUrl(value: string, requireHttps = true): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Official listing URL must be an absolute URL'); }
  if (requireHttps && url.protocol !== 'https:') throw new Error('Official listing URL must use HTTPS');
  return url.toString();
}

function assertNever(value: never): never { throw new Error(`Unknown journey action: ${JSON.stringify(value)}`); }
