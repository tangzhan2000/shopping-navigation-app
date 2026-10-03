import { describe, expect, it } from 'vitest';
import {
  createDecisionJourney,
  defaultJourneyCapabilities,
  InvalidJourneyTransitionError,
  transitionJourney,
  type CandidateSet,
  type DecisionJourneyState,
} from './index.js';

const result: CandidateSet = {
  candidates: [{ candidateId: 'c1', title: '无香洗衣液', matchLevel: 'exact', reasons: ['型号一致'], caveats: ['运费待确认'], sourceId: 'shop-a', officialUrl: 'https://shop.example/item/1', priceState: 'estimated', totalCost: { currency: 'CNY', totalMinor: 1200 } }],
  scope: { country: 'CN', currency: 'CNY', quantity: 1, sourceIds: ['shop-a'], memberStatus: 'unknown' },
  coverage: { queriedSourceIds: ['shop-a'], unavailableSourceIds: ['shop-b'] },
};

function move(state: DecisionJourneyState, action: Parameters<typeof transitionJourney>[1]): DecisionJourneyState {
  return transitionJourney(state, action);
}

describe('mobile decision journey', () => {
  it('runs input, confirmation, candidates, comparison and official fallback without platform APIs', () => {
    let state: DecisionJourneyState = createDecisionJourney({ journeyId: 'journey-1' });
    state = move(state, { type: 'submit_input', input: { inputType: 'text', content: '需要无香洗衣液' } });
    expect(state.stage).toBe('confirmation');
    if (state.stage !== 'confirmation') throw new Error('Expected confirmation');
    state = move(state, { type: 'edit_field', name: 'query', value: '无香洗衣液' });
    state = move(state, { type: 'confirm_input' });
    expect(state.stage).toBe('candidates');
    state = move(state, { type: 'candidates_loaded', result });
    state = move(state, { type: 'select_candidate', candidateId: 'c1' });
    expect(state.stage).toBe('comparison');
    state = move(state, { type: 'open_official' });
    expect(state).toMatchObject({ stage: 'official_fallback', handoff: { status: 'ready_for_user', officialUrl: 'https://shop.example/item/1', execution: defaultJourneyCapabilities.platform_execution } });
    expect(state.revision).toBe(6);
  });

  it('makes voice and OCR unavailability explicit and keeps text as the recovery path', () => {
    let state: DecisionJourneyState = createDecisionJourney({ journeyId: 'journey-2' });
    state = transitionJourney(state, { type: 'submit_input', input: { inputType: 'voice', content: 'find this' } });
    expect(state).toMatchObject({ stage: 'input', error: { code: 'unavailable_input', fallback: 'text' } });
    state = transitionJourney(state, { type: 'submit_input', input: { inputType: 'image', content: 'selected-image' } });
    expect(state).toMatchObject({ stage: 'input', error: { code: 'unavailable_input', fallback: 'text' } });
    state = transitionJourney(state, { type: 'submit_input', input: { inputType: 'text', content: 'kettle' } });
    expect(state.stage).toBe('confirmation');
  });

  it('extracts link fields and rejects unsafe/non-official handoff URLs', () => {
    let state: DecisionJourneyState = createDecisionJourney({ journeyId: 'journey-3' });
    state = move(state, { type: 'submit_input', input: { inputType: 'url', content: 'https://shop.example/item/1' } });
    expect(state.stage === 'confirmation' && state.fields.map(({ name }) => name)).toEqual(['url', 'sourceHost']);
    state = move(state, { type: 'confirm_input' });
    state = move(state, { type: 'candidates_loaded', result: { ...result, candidates: [{ ...result.candidates[0]!, officialUrl: 'http://shop.example/item/1' }] } });
    expect(() => move(state, { type: 'select_candidate', candidateId: 'c1' })).not.toThrow();
    state = move(state, { type: 'select_candidate', candidateId: 'c1' });
    expect(() => move(state, { type: 'open_official' })).toThrow('HTTPS');
  });

  it('rejects invalid order, unknown candidate and incomplete confirmation', () => {
    let state: DecisionJourneyState = createDecisionJourney({ journeyId: 'journey-4' });
    expect(() => move(state, { type: 'confirm_input' })).toThrow(InvalidJourneyTransitionError);
    state = move(state, { type: 'submit_input', input: { inputType: 'text', content: '   ' } });
    expect(state).toMatchObject({ stage: 'input', error: { code: 'empty_input' } });
    state = move(state, { type: 'submit_input', input: { inputType: 'text', content: 'chair' } });
    state = move(state, { type: 'confirm_input' });
    state = move(state, { type: 'candidates_loaded', result });
    expect(() => move(state, { type: 'select_candidate', candidateId: 'missing' })).toThrow('Unknown candidate');
  });

  it('accepts host-provided voice/OCR capability while execution remains explicit', () => {
    let state: DecisionJourneyState = createDecisionJourney({ journeyId: 'journey-5', capabilities: { ...defaultJourneyCapabilities, voice: { status: 'available' }, ocr: { status: 'available' } } });
    state = transitionJourney(state, { type: 'submit_input', input: { inputType: 'voice', content: 'desk lamp' } });
    expect(state.stage).toBe('confirmation');
    expect(state.capabilities.platform_execution.status).toBe('unavailable');
  });
});
