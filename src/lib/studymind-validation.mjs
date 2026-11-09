// Pure, dependency-free validation shared by the /api/studymind/* routes and unit tests.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ACCESS_TYPES = ['personal', 'class'];

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export function parseModuleInput(body) {
  if (!isObject(body)) return { ok: false, error: 'Invalid module' };
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 2 || title.length > 255) return { ok: false, error: 'Title must be 2–255 characters' };
  if (!ACCESS_TYPES.includes(body.access_type)) return { ok: false, error: 'Invalid access type' };
  // Only whitelisted fields are forwarded upstream.
  return { ok: true, value: { title, access_type: body.access_type } };
}

/** A Course ID is either a module UUID or a short course code. */
export function parseJoinInput(body) {
  if (!isObject(body) || typeof body.course_id !== 'string') return { ok: false, error: 'Enter a Course ID' };
  const courseId = body.course_id.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(courseId)) return { ok: false, error: 'That does not look like a valid Course ID' };
  return { ok: true, value: { course_id: isUuid(courseId) ? courseId.toLowerCase() : courseId } };
}

/** Mirrors the AI backend's ingestor.ALLOWED_EXTENSIONS. */
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv'];

export function validateUpload(file) {
  if (!file || typeof file.size !== 'number' || file.size <= 0) return { ok: false, error: 'The file is empty' };
  if (typeof file.name === 'string') {
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.includes(ext))
      return { ok: false, error: `Unsupported file type${ext ? ` "${ext}"` : ''}. Upload a PDF, DOCX, TXT, MD or CSV file.` };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'The file exceeds the 50 MB limit' };
  return { ok: true };
}

const DONE = ['indexed', 'ready', 'completed', 'complete', 'done', 'processed'];
const BUSY = ['pending', 'queued', 'processing', 'indexing', 'uploaded', 'uploading', 'in_progress', 'running'];
const FAILED = ['failed', 'error', 'errored'];

/** Normalises whichever status field the AI backend returns into indexed | processing | failed | unknown. */
export function documentStatus(doc) {
  if (!isObject(doc)) return 'unknown';
  const raw = String(doc.indexing_status ?? doc.processing_status ?? doc.status ?? '').toLowerCase();
  if (FAILED.includes(raw)) return 'failed';
  if (DONE.includes(raw)) return 'indexed';
  if (BUSY.includes(raw)) return 'processing';
  if (Number(doc.chunk_count) > 0) return 'indexed';
  return 'unknown';
}

export const hasPendingDocuments = (docs) => Array.isArray(docs) && docs.some((d) => documentStatus(d) === 'processing');

/** Which actions the AI backend permits per role (it enforces these too; the UI just avoids offering them). */
export function roleCapabilities(role) {
  return {
    canCreatePersonal: role === 'lecturer' || role === 'self_learner' || role === 'admin',
    canCreateClass: role === 'lecturer' || role === 'admin',
    canJoin: role === 'student' || role === 'self_learner',
    canUploadClass: role === 'lecturer' || role === 'admin',
  };
}

/** FastAPI `detail` may be a string, or a list of validation errors. Always returns a readable string. */
export function apiDetail(data, fallback) {
  const detail = isObject(data) ? data.detail : undefined;
  if (typeof detail === 'string' && detail.trim()) return detail.slice(0, 300);
  if (Array.isArray(detail) && detail.length && isObject(detail[0]) && typeof detail[0].msg === 'string')
    return detail[0].msg.slice(0, 300);
  return fallback;
}
