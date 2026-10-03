import { RecognitionTaskStore, type RecognitionInput } from '@shopping-navigation/domain';
import type { RecognitionTask } from '@shopping-navigation/contracts';
import { JsonSnapshot, type SnapshotIO } from './json-snapshot.js';

export interface RecognitionTaskStoreLike {
  create(input: RecognitionInput): Promise<RecognitionTask>;
  get(taskId: string, userId: string): Promise<RecognitionTask | undefined>;
  confirm(taskId: string, confirmedFields: readonly string[] | undefined, userId: string, fieldValues?: Readonly<Record<string, string>>): Promise<RecognitionTask>;
  delete(taskId: string, userId: string): Promise<RecognitionTask>;
}

export class InMemoryRecognitionTaskStore implements RecognitionTaskStoreLike {
  private readonly store = new RecognitionTaskStore();
  public async create(input: RecognitionInput): Promise<RecognitionTask> { return this.store.create(input); }
  public async get(taskId: string, userId: string): Promise<RecognitionTask | undefined> { return this.store.get(taskId, userId); }
  public async confirm(taskId: string, confirmedFields: readonly string[] | undefined, userId: string, fieldValues?: Readonly<Record<string, string>>): Promise<RecognitionTask> {
    return this.store.confirm(taskId, confirmedFields, userId, fieldValues);
  }
  public async delete(taskId: string, userId: string): Promise<RecognitionTask> { return this.store.delete(taskId, userId); }
}

interface FileState { readonly schemaVersion: 1; readonly tasks: readonly RecognitionTask[]; }

function decodeRecognitionState(raw: unknown): FileState {
  if (!raw || typeof raw !== 'object') throw new Error('Malformed or unsupported recognition task store');
  const state = raw as Partial<FileState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.tasks) || !state.tasks.every(isRecognitionTask)) throw new Error('Malformed or unsupported recognition task store');
  const store = new RecognitionTaskStore();
  for (const task of state.tasks) store.restore(task);
  return { schemaVersion: 1, tasks: state.tasks };
}

export class JsonFileRecognitionTaskStore implements RecognitionTaskStoreLike {
  private readonly snapshot: JsonSnapshot<FileState>;
  public constructor(filePath: string, io?: SnapshotIO) {
    this.snapshot = new JsonSnapshot(filePath, () => ({ schemaVersion: 1, tasks: [] }), decodeRecognitionState, io);
  }
  public create(input: RecognitionInput): Promise<RecognitionTask> {
    return this.snapshot.change((state) => {
      const store = recognitionMemory(state);
      if (store.list().some((task) => task.taskId === input.taskId)) throw new Error(`Duplicate recognition task ${input.taskId}`);
      const result = store.create(input);
      return { state: { schemaVersion: 1, tasks: store.list() }, result };
    });
  }
  public get(taskId: string, userId: string): Promise<RecognitionTask | undefined> {
    return this.snapshot.read((state) => recognitionMemory(state).get(taskId, userId));
  }
  public confirm(taskId: string, confirmedFields: readonly string[] | undefined, userId: string, fieldValues?: Readonly<Record<string, string>>): Promise<RecognitionTask> {
    return this.snapshot.change((state) => {
      const store = recognitionMemory(state);
      const result = store.confirm(taskId, confirmedFields, userId, fieldValues);
      return { state: { schemaVersion: 1, tasks: store.list() }, result };
    });
  }
  public delete(taskId: string, userId: string): Promise<RecognitionTask> {
    return this.snapshot.change((state) => {
      const store = recognitionMemory(state);
      const result = store.delete(taskId, userId);
      return { state: { schemaVersion: 1, tasks: store.list() }, result };
    });
  }
}

function recognitionMemory(state: FileState): RecognitionTaskStore {
  const store = new RecognitionTaskStore();
  for (const task of state.tasks) store.restore(task);
  return store;
}

function isRecognitionTask(value: unknown): value is RecognitionTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<RecognitionTask>;
  return typeof task.taskId === 'string' && !!task.taskId && typeof task.userId === 'string' && !!task.userId
    && ['text', 'url', 'share', 'taobao_token', 'image', 'voice'].includes(task.inputType ?? '') && Array.isArray(task.fields)
    && ['processing', 'needs_confirmation', 'confirmed', 'failed', 'deleted'].includes(task.status ?? '')
    && task.fields.every((field) => field && typeof field.name === 'string' && typeof field.value === 'string'
      && typeof field.confidence === 'number' && Number.isFinite(field.confidence) && typeof field.confirmedByUser === 'boolean');
}
