import { describe, expect, it } from 'vitest';
import { RecognitionTaskStore, recognizeFields } from './recognition.js';

describe('recognition task', () => {
  it('structures URL input without fetching or claiming product identity', () => {
    const fields = recognizeFields('url', 'https://shop.example/item/42');
    expect(fields).toEqual([
      { name: 'url', value: 'https://shop.example/item/42', confidence: 0.5, confirmedByUser: false },
      { name: 'sourceHost', value: 'shop.example', confidence: 0.5, confirmedByUser: false },
    ]);
  });

  it('requires confirmation and supports deletion', () => {
    const store = new RecognitionTaskStore();
    const task = store.create({ taskId: 'task-1', inputType: 'text', content: '需要 2 件无香洗衣液' });
    expect(task.status).toBe('needs_confirmation');
    expect(task.fields.find((item) => item.name === 'quantity')?.value).toBe('2');
    expect(store.confirm('task-1').status).toBe('confirmed');
    expect(store.delete('task-1').status).toBe('deleted');
  });

  it('persists reviewed field edits and rejects unknown or empty values', () => {
    const store = new RecognitionTaskStore();
    store.create({ taskId: 'edited-task', userId: 'owner', inputType: 'text', content: '洗衣液' });
    expect(() => store.confirm('edited-task', ['query'], 'owner', { other: 'x' })).toThrow();
    expect(() => store.confirm('edited-task', ['query'], 'owner', { query: '  ' })).toThrow();
    const confirmed = store.confirm('edited-task', ['query'], 'owner', { query: '无香洗衣液' });
    expect(confirmed.fields[0]).toMatchObject({ name: 'query', value: '无香洗衣液', confirmedByUser: true });
    expect(store.get('edited-task', 'owner')?.fields[0]?.value).toBe('无香洗衣液');
  });

  it('rejects malformed links and empty input', () => {
    expect(recognizeFields('url', 'not a url')).toEqual([]);
    const store = new RecognitionTaskStore();
    expect(store.create({ taskId: 'task-2', inputType: 'text', content: '   ' }).status).toBe('failed');
  });
});
