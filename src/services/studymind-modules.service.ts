export type CanonicalModule = {
  id: string; title: string; description: string | null; course_code: string | null;
  owner_id: string; access_type: string; status: string; updated_at: string;
};

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to load StudyMind modules');
  return body as T;
}
export const studyMindModulesService = {
  list: async () => responseData<CanonicalModule[]>(await fetch('/api/studymind/modules', { cache: 'no-store' })),
  create: async (title: string, access_type: 'personal' | 'class') => responseData<CanonicalModule>(
    await fetch('/api/studymind/modules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, access_type }),
    }),
  ),
};
