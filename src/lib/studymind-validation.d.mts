export const MAX_UPLOAD_BYTES: number;
export const ACCESS_TYPES: readonly ['personal', 'class'];
export type DocumentStatus = 'indexed' | 'processing' | 'failed' | 'unknown';
export function isUuid(value: unknown): value is string;
export function parseModuleInput(body: unknown): { ok: true; value: { title: string; access_type: 'personal' | 'class' } } | { ok: false; error: string };
export function parseJoinInput(body: unknown): { ok: true; value: { course_id: string } } | { ok: false; error: string };
export function validateUpload(file: { size?: number } | null | undefined): { ok: true } | { ok: false; error: string };
export function documentStatus(doc: unknown): DocumentStatus;
export function hasPendingDocuments(docs: unknown): boolean;
