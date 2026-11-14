import 'server-only';
import { cookies } from 'next/headers';

const base = (process.env.STUDYMIND_AI_BASE_URL || 'https://api.aismartlearner.com').replace(/\/+$/, '');
const accessCookie = 'studymind_ai_access';
const refreshCookie = 'studymind_ai_refresh';

export type CanonicalUser = { id: string; email: string; full_name: string; role: string };
export type LearningOverview = { user: CanonicalUser; modules: { owned: number; enrolled: number } };
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

/** Routes Web may call on the canonical AI backend. Anything else is refused before a request is made. */
const IDENTITY_PATH = /^\/api\/auth\//;  // covers /api/auth/magic-verify and all other auth routes
const LEARNING_PATH = /^\/api\/(billing\/checkout$|sessions(\?module_id=[0-9a-f-]{36})?$|sessions\/[0-9a-f-]{36}$|modules(\/|$)|chat$|quiz\/[0-9a-f-]{36}\/submit$|quiz\/generate$|quiz\/history\/list\?module_id=[0-9a-f-]{36}$|quiz\/[0-9a-f-]{36}$|flashcards\/generate$|flashcards\?module_id=[0-9a-f-]{36}$|flashcards\/[0-9a-f-]{36}$|summarise$|summarise\?module_id=[0-9a-f-]{36}$|summarise\/[0-9a-f-]{36}$)/i;

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
// This map lives in one server process; a deployment with several instances needs sticky sessions or a shared store.
//
// A refresh has THREE outcomes and only one of them ends the session:
//   ok          - new tokens, store them
//   invalid     - the backend answered 400/401/403: the refresh token is expired, revoked or already used -> sign out
//   unavailable - 5xx, 429, timeout or network error: the session may be perfectly valid, so keep the cookies and tell
//                 the caller to retry later. Clearing here would turn a backend blip into a forced logout.
const REFRESH_REUSE_MS = 15_000;
type RefreshOutcome = { kind: 'ok'; tokens: TokenResponse } | { kind: 'invalid' } | { kind: 'unavailable' };
const refreshes = new Map<string, { at: number; result: Promise<RefreshOutcome> }>();
function refreshTokens(refresh: string): Promise<RefreshOutcome> {
  const now = Date.now();
  for (const [key, entry] of refreshes) if (now - entry.at > REFRESH_REUSE_MS) refreshes.delete(key);
  const existing = refreshes.get(refresh);
  if (existing) return existing.result;
  const result: Promise<RefreshOutcome> = (async () => {
    try {
      const response = await aiIdentityRequest('/api/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
      });
      if (response.ok) return { kind: 'ok', tokens: (await response.json()) as TokenResponse } as const;
      return { kind: [400, 401, 403].includes(response.status) ? 'invalid' : 'unavailable' } as const;
    } catch { return { kind: 'unavailable' } as const; }
  })();
  refreshes.set(refresh, { at: now, result });
  void result.then((r) => { if (r.kind === 'unavailable') refreshes.delete(refresh); });   // a transient failure must not be cached
  return result;
}

const unavailable = () => new Response(JSON.stringify({ error: 'StudyMind is temporarily unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

/** Calls the backend with the user's access token, recovering from an expired one. Returns null only when there is NO usable
 *  session (no cookies, or the refresh token is genuinely invalid - cookies are then cleared). A temporary failure returns a
 *  503 Response and leaves the cookies alone. A 403 or any other non-401 status is passed through untouched. */
async function callWithRecovery(path: string, init: RequestInit): Promise<Response | null> {
  const jar = await cookies();
  const access = jar.get(accessCookie)?.value;
  const refresh = jar.get(refreshCookie)?.value;
  if (!access && !refresh) return null;
  const withToken = (token: string): RequestInit => ({ ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (access) {
    const result = await aiIdentityRequest(path, withToken(access));
    if (result.status !== 401) return result;
  }
  if (!refresh) { await clearAiTokens(); return null; }
  const outcome = await refreshTokens(refresh);
  if (outcome.kind === 'unavailable') return unavailable();
  if (outcome.kind === 'invalid') { await clearAiTokens(); return null; }
  await setAiTokens(outcome.tokens);
  return aiIdentityRequest(path, withToken(outcome.tokens.access_token));
}

export function authenticatedAiRequest(path: string): Promise<Response | null> {
  return callWithRecovery(path, {});
}
export async function authenticatedAiFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!LEARNING_PATH.test(path)) throw new Error('Invalid learning API route');
  return callWithRecovery(path, init);
}

/** Returns a valid access token for the current session (refreshing if needed), or null if there is no session.
 *  Used by the direct-upload flow: the browser uploads large files straight to the AI backend,
 *  bypassing Render's 30-second request timeout. The token is short-lived and read-once. */
export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(accessCookie)?.value;
  const refresh = jar.get(refreshCookie)?.value;
  if (!access && !refresh) return null;
  if (access) {
    // Quick check: try to use it. If it's still valid return it immediately.
    // We don't want to burn a network round-trip just to verify — the browser will get a 401
    // on the direct upload and can retry after calling this endpoint again.
    return access;
  }
  if (!refresh) { await clearAiTokens(); return null; }
  const outcome = await refreshTokens(refresh);
  if (outcome.kind === 'unavailable') return null;
  if (outcome.kind === 'invalid') { await clearAiTokens(); return null; }
  await setAiTokens(outcome.tokens);
  return outcome.tokens.access_token;
}

/** Sign out: revoke the refresh token on the backend (best effort, so a copied cookie cannot be replayed), forget any
 *  cached refresh result for it, and clear the cookies whatever the backend says. */
export async function revokeAiSession() {
  const jar = await cookies();
  const refresh = jar.get(refreshCookie)?.value;
  if (refresh) {
    refreshes.delete(refresh);
    try {
      await aiIdentityRequest('/api/auth/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }), signal: AbortSignal.timeout(4000),
      });
    } catch { /* the user still signs out locally */ }
  }
  await clearAiTokens();
}
