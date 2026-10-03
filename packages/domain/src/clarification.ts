import type { ClarificationState, RecognitionField } from '@shopping-navigation/contracts';

export function buildClarificationState(taskId: string, fields: readonly RecognitionField[]): ClarificationState {
  const hardConstraints: Record<string, string> = {};
  const preferences: Record<string, string> = {};
  const unknownFields: string[] = [];
  for (const field of fields) {
    if (!field.value.trim()) unknownFields.push(field.name);
    else if (field.name === 'quantity' || field.name === 'url' || field.name === 'sourceHost') hardConstraints[field.name] = field.value;
    else preferences[field.name] = field.value;
  }
  const questions = unknownFields.map((field, index) => ({
    questionId: `${taskId}-question-${index + 1}`,
    field,
    prompt: field === 'quantity' ? '需要购买多少件？' : `请补充${field}。`,
    required: true,
    informationGain: 1,
  }));
  return { taskId, hardConstraints, preferences, unknownFields, questions, completed: unknownFields.length === 0 };
}
