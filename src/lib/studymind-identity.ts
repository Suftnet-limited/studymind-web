import 'server-only';
import { cookies } from 'next/headers';

const base = (process.env.STUDYMIND_AI_BASE_URL || 'https://api.aismartlearner.com').replace(/\/+$/, '');
const accessCookie = 'studymind_ai_access';
const refreshCookie = 'studymind_ai_refresh';

export type CanonicalUser = { id: string; email: string; full_name: string; role: string };
export type LearningOverview = { user: CanonicalUser; modules: { owned: number; enrolled: number } };
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

/** Routes Web may call on the canonical AI backend. Anything else is refused before a request is made. */
const IDENTITY_PATH = /^\/api\/auth\//;
const LEARNING_PATH = /^\/api\/(modules(\/|$)|chat$|quiz\/[0-9a-f-]{36}\/submit$|quiz\/generate$|flashcards\/generate$|summarise$)/i;

export async function aiIdentityRequest(path: string, init: RequestInit = {}) {
  if (!IDENTITY_PATH.test(path) && !LEARNING_PATH.test(path)) throw new Error('Invalid StudyMind API route');
  // AI generation can take far longer than an identity call, so callers may pass their own signal.
  return fetch(base + path, { ...init, cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(12000) });
}

export async function setAiTokens(tokens: TokenResponse) {
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
  jar.set(accessCookie, tokens.access_token, { ...options, maxAge: Math.max(1, Math.min(tokens.expires_in, 86400)) });
  jar.set(refreshCookie, tokens.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearAiTokens() {
  const jar = await cookies();
  jar.delete(accessCookie);
  jar.delete(refreshCookie);
}

export async function authenticatedAiRequest(path: string): Promise<Response | null> {
  const jar = await cookies();
  let access = jar.get(accessCookie)?.value;
  const refresh = jar.get(refreshCookie)?.value;
  if (!access && !refresh) return null;
  if (access) {
    const result = await aiIdentityRequest(path, { headers: { Authorization: `Bearer ${access}` } });
    if (result.status !== 401) return result;
  }
  if (!refresh) return null;
  const refreshed = await aiIdentityRequest('/api/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!refreshed.ok) { await clearAiTokens(); return null; }
  const tokens: TokenResponse = await refreshed.json();
  await setAiTokens(tokens);
  access = tokens.access_token;
  return aiIdentityRequest(path, { headers: { Authorization: `Bearer ${access}` } });
}
export async function authenticatedAiFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!LEARNING_PATH.test(path)) throw new Error('Invalid learning API route');
  const jar = await cookies();
  const access = jar.get(accessCookie)?.value;
  const refresh = jar.get(refreshCookie)?.value;
  if (!access && !refresh) return null;
  if (access) {
    const result = await aiIdentityRequest(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${access}` } });
    if (result.status !== 401) return result;
  }
  if (!refresh) return null;
  const refreshed = await aiIdentityRequest('/api/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!refreshed.ok) { await clearAiTokens(); return null; }
  const tokens: TokenResponse = await refreshed.json();
  await setAiTokens(tokens);
  return aiIdentityRequest(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${tokens.access_token}` } });
}
