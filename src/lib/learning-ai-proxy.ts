import 'server-only';
import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { aiFailure, mapSessionDetail, mapSessionList, sessionIds } from '@/lib/learning-ai.mjs';
import { isUuid } from '@/lib/studymind-validation.mjs';
import { isCrossSite } from '@/lib/request-origin.mjs';

/** AI generation is slow; this bounds a single proxied call (the identity default of 12s is too short). */
export const AI_TIMEOUT_MS = 90_000;
const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export type ModuleContext = { params: Promise<{ id: string; attemptId?: string }> };
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

async function readBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, response: fail(413, 'Request is too large') };
  const raw = await request.text().catch(() => null);
  if (raw === null || raw.length > MAX_BODY_BYTES) return { ok: false, response: fail(400, 'Invalid request') };
  if (!raw.trim()) return { ok: true, body: undefined };
  try { return { ok: true, body: JSON.parse(raw) }; } catch { return { ok: false, response: fail(400, 'Invalid JSON') }; }
}

/**
 * Confirms, with the caller's own AI session, that they can read this module. The AI generation endpoints do not
 * check module membership themselves, so this check is what keeps AI output scoped to modules the user can open.
 */
async function requireModuleAccess(moduleId: string): Promise<NextResponse | null> {
  const res = await authenticatedAiFetch(`/api/modules/${moduleId}`);
  if (!res || res.status === 401) return fail(401, 'Authentication required');
  if (res.ok) return null;
  const f = aiFailure(res.status === 403 || res.status === 404 ? res.status : 500, null);
  return fail(f.status, f.error);
}

type RouteSpec<I> = {
  /** Validates and whitelists the browser input. */
  parse: (body: unknown) => Parsed<I>;
  /** AI backend path (allow-listed in studymind-identity). */
  path: (ctx: { moduleId: string; attemptId?: string }) => string;
  /** Builds the upstream payload. The module id is always the validated URL id. */
  build: (moduleId: string, input: I) => Record<string, unknown>;
  /** Maps the upstream response to the public shape (returns null if malformed). */
  map: (raw: unknown) => unknown | null;
  status?: number;
};

export function aiRoute<I>(spec: RouteSpec<I>) {
  return async function POST(request: Request, context: ModuleContext) {
    const { id, attemptId } = await context.params;
    if (!isUuid(id)) return fail(400, 'Invalid module ID');
    if (attemptId !== undefined && !isUuid(attemptId)) return fail(400, 'Invalid quiz ID');
    const read = await readBody(request);
    if (!read.ok) return read.response;
    const parsed = spec.parse(read.body);
    if (!parsed.ok) return fail(400, parsed.error);
    try {
      const denied = await requireModuleAccess(id);
      if (denied) return denied;
      const upstream = await authenticatedAiFetch(spec.path({ moduleId: id, attemptId }), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec.build(id, parsed.value)), signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!upstream || upstream.status === 401) return fail(401, 'Authentication required');
      const data = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        const f = aiFailure(upstream.status, data);
        if (f.status >= 500) console.error('StudyMind AI request failed', upstream.status); // status only; never the body
        return fail(f.status, f.error);
      }
      const mapped = spec.map(data);
      if (!mapped) { console.error('StudyMind AI returned an unexpected response shape'); return fail(502, aiFailure(502, null).error); }
      return NextResponse.json(mapped, { status: spec.status ?? 200, headers: NO_STORE });
    } catch (e) {
      console.error('StudyMind AI proxy error', e instanceof Error ? e.name : 'unknown');
      return fail(502, aiFailure(502, null).error);
    }
  };
}


// ── Chat history ──────────────────────────────────────────────────────────
// The backend returns only the caller's OWN sessions, but its session-detail response does not say which module a chat belongs to.
// So every history call here (1) requires access to the module in the URL, then (2) proves the session is one of the caller's
// sessions FOR THAT MODULE by checking the module-filtered list, so a chat from module A can never be read while viewing module B.
export type SessionContext = { params: Promise<{ id: string; sessionId?: string }> };

async function ownSessionsForModule(moduleId: string): Promise<{ ok: true; raw: unknown } | { ok: false; response: NextResponse }> {
  const denied = await requireModuleAccess(moduleId);
  if (denied) return { ok: false, response: denied };
  const res = await authenticatedAiFetch(`/api/sessions?module_id=${moduleId}`);
  if (!res || res.status === 401) return { ok: false, response: fail(401, 'Authentication required') };
  if (!res.ok) { const f = aiFailure(res.status, null); return { ok: false, response: fail(f.status, f.error) }; }
  return { ok: true, raw: await res.json().catch(() => null) };
}

export async function sessionList(context: SessionContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return fail(400, 'Invalid module ID');
  try {
    const own = await ownSessionsForModule(id);
    if (!own.ok) return own.response;
    return NextResponse.json(mapSessionList(own.raw), { headers: NO_STORE });
  } catch { return fail(502, aiFailure(502, null).error); }
}

export async function sessionOpen(context: SessionContext) {
  const { id, sessionId } = await context.params;
  if (!isUuid(id)) return fail(400, 'Invalid module ID');
  if (!sessionId || !isUuid(sessionId)) return fail(400, 'Invalid chat ID');
  try {
    const own = await ownSessionsForModule(id);
    if (!own.ok) return own.response;
    if (!sessionIds(own.raw).includes(sessionId.toLowerCase())) return fail(404, 'This chat could not be found.');
    const res = await authenticatedAiFetch(`/api/sessions/${sessionId.toLowerCase()}`);
    if (!res || res.status === 401) return fail(401, 'Authentication required');
    if (!res.ok) { const f = aiFailure(res.status === 404 ? 404 : 500, null); return fail(f.status, res.status === 404 ? 'This chat could not be found.' : f.error); }
    const detail = mapSessionDetail(await res.json().catch(() => null));
    if (!detail) return fail(502, aiFailure(502, null).error);
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch { return fail(502, aiFailure(502, null).error); }
}

export async function sessionDelete(request: Request, context: SessionContext) {
  if (isCrossSite(request)) return fail(403, 'Cross-site requests are not allowed');
  const { id, sessionId } = await context.params;
  if (!isUuid(id)) return fail(400, 'Invalid module ID');
  if (!sessionId || !isUuid(sessionId)) return fail(400, 'Invalid chat ID');
  try {
    const own = await ownSessionsForModule(id);
    if (!own.ok) return own.response;
    if (!sessionIds(own.raw).includes(sessionId.toLowerCase())) return fail(404, 'This chat could not be found.');
    const res = await authenticatedAiFetch(`/api/sessions/${sessionId.toLowerCase()}`, { method: 'DELETE' });
    if (!res || res.status === 401) return fail(401, 'Authentication required');
    if (!res.ok && res.status !== 404) { const f = aiFailure(500, null); return fail(f.status, f.error); }
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch { return fail(502, aiFailure(502, null).error); }
}
