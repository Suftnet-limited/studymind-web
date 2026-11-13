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

export const studyMindModulesService = {
  list: async () => responseData<CanonicalModule[]>(await fetch(base, { cache: 'no-store' }), 'Unable to load your modules'),
  get: async (id: string) => responseData<CanonicalModule>(await fetch(modulePath(id), { cache: 'no-store' }), 'Unable to load this module'),
  create: async (title: string, access_type: 'personal' | 'class') =>
    responseData<CanonicalModule>(await fetch(base, jsonInit({ title, access_type })), 'Unable to create module'),
  join: async (course_id: string) =>
    responseData<{ module_id: string; enrolment_id: string }>(await fetch(`${base}/join`, jsonInit({ course_id })), 'Unable to join course'),
  documents: async (id: string) =>
    responseData<CanonicalDocument[]>(await fetch(`${modulePath(id)}/documents`, { cache: 'no-store' }), 'Unable to load materials'),
  upload: async (id: string, file: File, visibility: 'personal' | 'class') => {
    const form = new FormData();
    form.set('file', file); form.set('visibility', visibility);
    return responseData<UploadResult>(await fetch(`${modulePath(id)}/documents`, { method: 'POST', body: form }), 'Unable to upload document');
  },
};
