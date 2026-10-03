import type { RecognitionField, RecognitionTask } from '@shopping-navigation/contracts';

export interface RecognitionInput {
  readonly taskId: string;
  readonly userId?: string;
  readonly inputType: RecognitionTask['inputType'];
  readonly content: string;
}

export class RecognitionTaskError extends Error {
  public constructor(message: string) { super(message); this.name = 'RecognitionTaskError'; }
}

export class RecognitionTaskStore {
  private readonly tasks = new Map<string, RecognitionTask>();

  public create(input: RecognitionInput): RecognitionTask {
    if (this.tasks.has(input.taskId)) throw new RecognitionTaskError(`Duplicate recognition task ${input.taskId}`);
    const fields = recognizeFields(input.inputType, input.content);
    const task: RecognitionTask = {
      taskId: input.taskId,
      userId: input.userId ?? 'local-test',
      inputType: input.inputType,
      fields,
      status: fields.length > 0 ? 'needs_confirmation' : 'failed',
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  public confirm(taskId: string, confirmedFields?: readonly string[], userId?: string, fieldValues?: Readonly<Record<string, string>>): RecognitionTask {
    const task = this.getOwned(taskId, userId);
    if (task.status !== 'needs_confirmation') throw new RecognitionTaskError(`Task ${taskId} is not awaiting confirmation`);
    const allowed = new Set(task.fields.map((field) => field.name));
    if (fieldValues && Object.entries(fieldValues).some(([name, value]) => !allowed.has(name) || !value.trim())) {
      throw new RecognitionTaskError('Confirmed field values must be non-empty and belong to this task');
    }
    if (fieldValues && task.fields.some((field) => !Object.hasOwn(fieldValues, field.name))) {
      throw new RecognitionTaskError('Confirmed field values must include every task field');
    }
    const fields = task.fields.map((field) => ({
      ...field,
      ...(fieldValues?.[field.name] === undefined ? {} : { value: fieldValues[field.name] }),
      confirmedByUser: confirmedFields ? confirmedFields.includes(field.name) : true,
    }));
    if (confirmedFields && fields.some((field) => !field.confirmedByUser)) {
      const partial = { ...task, fields };
      this.tasks.set(taskId, partial);
      return partial;
    }
    const confirmed = { ...task, fields, status: 'confirmed' as const };
    this.tasks.set(taskId, confirmed);
    return confirmed;
  }

  public restore(task: RecognitionTask): void {
    if (this.tasks.has(task.taskId)) throw new RecognitionTaskError(`Duplicate recognition task ${task.taskId}`);
    this.tasks.set(task.taskId, structuredClone(task));
  }

  public list(): readonly RecognitionTask[] {
    return [...this.tasks.values()].map((task) => structuredClone(task));
  }

  public get(taskId: string, userId?: string): RecognitionTask | undefined {
    const task = this.tasks.get(taskId);
    return task && (userId === undefined || task.userId === userId) ? task : undefined;
  }

  public delete(taskId: string, userId?: string): RecognitionTask {
    const task = this.getOwned(taskId, userId);
    const deleted = { ...task, status: 'deleted' as const };
    this.tasks.set(taskId, deleted);
    return deleted;
  }

  private getOwned(taskId: string, userId?: string): RecognitionTask {
    const task = this.tasks.get(taskId);
    if (!task || (userId !== undefined && task.userId !== userId)) throw new RecognitionTaskError(`Unknown recognition task ${taskId}`);
    return task;
  }
}

function field(name: string, value: string): RecognitionField {
  return { name, value, confidence: 0.5, confirmedByUser: false };
}

export function recognizeFields(inputType: RecognitionTask['inputType'], content: string): readonly RecognitionField[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (inputType === 'url' || /^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return [field('url', url.toString()), field('sourceHost', url.hostname)];
    } catch {
      return [];
    }
  }

  if (inputType === 'taobao_token') {
    const token = trimmed.match(/[￥$]([^￥$\s]{4,})[￥$]?/u)?.[1] ?? trimmed;
    return [field('taobaoToken', token)];
  }

  if (inputType === 'text' || inputType === 'voice' || inputType === 'share') {
    const quantity = trimmed.match(/(?:买|要|需要|数量)\s*(\d+)/u)?.[1];
    const fields: RecognitionField[] = [field('query', trimmed)];
    if (quantity) fields.push(field('quantity', quantity));
    return fields;
  }

  return [field('rawInput', trimmed)];
}
