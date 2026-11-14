export type CanonicalModule = {
  id: string; title: string; description: string | null; course_code: string | null;
  owner_id: string; access_type: string; status: string; updated_at: string;
  created_at?: string; document_count?: number; student_count?: number; progress?: number; emoji?: string | null; enrolled_at?: string | null;
};
export type CanonicalDocument = {
  id: string; filename?: string; original_filename?: string; visibility?: string;
  chunk_count?: number; file_type?: string; status?: string; indexing_status?: string; processing_status?: string;
};

export type UploadResult = { document_id?: string; filename?: string; status?: string; message?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function responseData<T>(response: Response, fallback = 'Request failed'): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || fallback, response.status);
  return body as T;
}
const base = '/api/studymind/modules';
const modulePath = (id: string) => `${base}/${encodeURIComponent(id)}`;
const jsonInit = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** The AI backend's public base URL — set at build time, never changes at runtime. */
const AI_BASE = process.env.NEXT_PUBLIC_AI_BASE_URL ?? 'https://api.aismartlearner.com';

export const studyMindModulesService = {
  list: async () => responseData<CanonicalModule[]>(await fetch(base, { cache: 'no-store' }), 'Unable to load your modules'),
  get: async (id: string) => responseData<CanonicalModule>(await fetch(modulePath(id), { cache: 'no-store' }), 'Unable to load this module'),
  create: async (title: string, access_type: 'personal' | 'class') =>
    responseData<CanonicalModule>(await fetch(base, jsonInit({ title, access_type })), 'Unable to create module'),
  join: async (course_id: string) =>
    responseData<{ module_id: string; enrolment_id: string }>(await fetch(`${base}/join`, jsonInit({ course_id })), 'Unable to join course'),
  documents: async (id: string) =>
    responseData<CanonicalDocument[]>(await fetch(`${modulePath(id)}/documents`, { cache: 'no-store' }), 'Unable to load materials'),

  /**
   * Upload a document directly from the browser to the AI backend, bypassing
   * Render's 30-second request timeout. Flow:
   *   1. Fetch a short-lived access token from /api/studymind/upload-token (fast, <1 s).
   *   2. POST the file straight to api.aismartlearner.com — no Render in the path.
   *
   * On a 401 (token expired mid-upload) we retry once after fetching a fresh token.
   */
  upload: async (id: string, file: File, visibility: 'personal' | 'class'): Promise<UploadResult> => {
    const getToken = async (): Promise<string> => {
      const res = await fetch('/api/studymind/upload-token', { cache: 'no-store' });
      if (!res.ok) throw new ApiError('Authentication required', res.status);
      const { token } = await res.json();
      return token as string;
    };

    const doUpload = async (token: string): Promise<Response> => {
      const form = new FormData();
      form.set('file', file);
      const qs = new URLSearchParams({ visibility });
      return fetch(`${AI_BASE}/api/modules/${encodeURIComponent(id)}/documents?${qs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    };

    let token = await getToken();
    let res = await doUpload(token);

    // Retry once if the token expired during the upload (rare but possible for very large files).
    if (res.status === 401) {
      token = await getToken();
      res = await doUpload(token);
    }

    return responseData<UploadResult>(res, 'Unable to upload document');
  },
};
