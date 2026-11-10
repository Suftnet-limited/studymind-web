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

// Refresh tokens are single-use: if two requests both find the access token expired and each refreshes with the same
// refresh token, the second refresh is rejected and (below) would sign the user out. Concurrent requests - the page, the
// header status check, API calls - therefore share ONE refresh per refresh token. The result is kept briefly so a request
// that still carries the old cookie (the browser has not yet received the new one) reuses it instead of retrying.
const REFRESH_REUSE_MS = 15_000;
const refreshes = new Map<string, { at: number; result: Promise<TokenResponse | null> }>();
function refreshTokens(refresh: string): Promise<TokenResponse | null> {
  const now = Date.now();
  for (const [key, entry] of refreshes) if (now - entry.at > REFRESH_REUSE_MS) refreshes.delete(key);
  const existing = refreshes.get(refresh);
  if (existing) return existing.result;
  const result = (async () => {
    const response = await aiIdentityRequest('/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
    });
    return response.ok ? ((await response.json()) as TokenResponse) : null;
  })();
  refreshes.set(refresh, { at: now, result });
  result.catch(() => refreshes.delete(refresh));   // a network error must not be cached
  return result;
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
  const tokens = await refreshTokens(refresh);
  if (!tokens) { await clearAiTokens(); return null; }
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
  const tokens = await refreshTokens(refresh);
  if (!tokens) { await clearAiTokens(); return null; }
  await setAiTokens(tokens);
  return aiIdentityRequest(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${tokens.access_token}` } });
}
