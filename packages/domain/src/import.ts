import { createHash } from 'node:crypto';
import type { ImportKind, UserImport } from '@shopping-navigation/contracts';

export interface ImportInput {
  readonly userId: string;
  readonly kind: ImportKind;
  readonly content: string;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly now?: string;
  readonly ttlMs?: number;
}

const MAX_IMPORT_BYTES = 2_000_000;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'text/plain', 'text/uri-list']);

export function createUserImport(input: ImportInput): UserImport {
  const content = input.content.trim();
  if (!content) throw new Error('Import content is required');
  if (input.sizeBytes !== undefined && (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0 || input.sizeBytes > MAX_IMPORT_BYTES)) throw new Error('Import exceeds the local size limit');
  if (input.mediaType && !ALLOWED_MEDIA_TYPES.has(input.mediaType)) throw new Error('Import media type is not supported');
  const now = input.now ?? new Date().toISOString();
  const createdAt = new Date(now);
  const expiresAt = new Date(createdAt.getTime() + (input.ttlMs ?? 15 * 60_000)).toISOString();
  return {
    importId: `import-${createHash('sha256').update(`${input.userId}:${input.kind}:${now}:${content}`).digest('hex').slice(0, 20)}`,
    userId: input.userId,
    kind: input.kind,
    ...(input.mediaType ? { mediaType: input.mediaType } : {}),
    ...(input.sizeBytes === undefined ? {} : { sizeBytes: input.sizeBytes }),
    sha256: createHash('sha256').update(content).digest('hex'),
    content,
    createdAt: now,
    expiresAt,
  };
}

export function isImportExpired(record: UserImport, now = new Date()): boolean {
  return new Date(record.expiresAt).getTime() <= now.getTime();
}
