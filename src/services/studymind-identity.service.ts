import type { LearningOverview } from '@/lib/studymind-identity';

async function jsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'StudyMind identity request failed');
  }
  return response.json() as Promise<T>;
}

export const studyMindIdentityService = {
  login: async (email: string, password: string) => jsonResponse<{ authenticated: boolean }>(
    await fetch('/api/studymind/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }), credentials: 'same-origin',
    }),
  ),
  overview: async () => jsonResponse<LearningOverview>(
    await fetch('/api/studymind/learning-overview', { credentials: 'same-origin', cache: 'no-store' }),
  ),
  logout: async () => jsonResponse<{ authenticated: boolean }>(
    await fetch('/api/studymind/auth/logout', { method: 'POST', credentials: 'same-origin' }),
  ),
};
