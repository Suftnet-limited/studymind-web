export type IndexDocument = { id: string; filename: string; status: 'pending'|'indexing'|'ready'|'failed'; chunkCount: number; error: string|null };
async function responseData(res: Response) { const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || 'Request failed'); return data; }
export const moduleService = {
  async join(courseId: string) {
    const form = new FormData(); form.set('courseId', courseId);
    const res = await fetch('/api/modules/enrol', { method: 'POST', body: form });
    if (!res.ok) await responseData(res);
    if (res.redirected) { const url = new URL(res.url); if (url.origin !== window.location.origin) throw new Error('Unexpected redirect'); return url.pathname + url.search; }
    return '/modules';
  },
  async upload(moduleId: string, data: FormData) {
    return responseData(await fetch(`/api/modules/${encodeURIComponent(moduleId)}/documents`, { method: 'POST', body: data }));
  },
  async indexingStatus(moduleId: string, signal?: AbortSignal): Promise<IndexDocument[]> {
    const data = await responseData(await fetch(`/api/modules/${encodeURIComponent(moduleId)}/documents/status`, { cache: 'no-store', signal }));
    return data.documents || [];
  },
  async ai(moduleId: string, operation: string, payload: Record<string,unknown> = {}) {
    return responseData(await fetch(`/api/modules/${encodeURIComponent(moduleId)}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ...payload }) }));
  },
};
