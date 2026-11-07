import { NextResponse } from 'next/server';
import { moduleAccess, hasActivePass } from '@/lib/module-access';

export const runtime = 'nodejs';

/**
 * Exchanges the server-only platform key for a course-scoped session token.
 * The course/user/role are resolved from the signed-in web session, never
 * accepted from the caller. Mirrors the Edquis integration.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const moduleId = body && typeof body === 'object' && !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).moduleId === 'string'
      ? (body as {moduleId:string}).moduleId : '';
  if (!moduleId || moduleId.length > 255)
    return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });

  const access = await moduleAccess(moduleId);
  if (!access) return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  const pass = await hasActivePass(access.userId);
  if (!pass) return NextResponse.json({ error: 'An active StudyMind pass is required' }, { status: 402 });

  const apiKey = process.env.STUDYMIND_AI_PLATFORM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'StudyMind AI is not configured' }, { status: 503 });
  const apiUrl = (process.env.STUDYMIND_AI_BASE_URL || 'https://api.aismartlearner.com').replace(/\/+$/, '');
  try {
    const upstream = await fetch(apiUrl + '/api/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: moduleId, user_id: access.userId,
        user_role: access.isLecturer ? 'tutor' : 'student',
        expires_in: 3600,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) {
      console.error('StudyMind session exchange rejected', upstream.status);
      return NextResponse.json({ error: 'Unable to connect to StudyMind AI' }, { status: 502 });
    }
    const result: { session_token?:string; expires_at?:string; expires_in?:number } = await upstream.json();
    if (!result.session_token || !result.expires_at)
      return NextResponse.json({ error: 'Invalid StudyMind session response' }, { status: 502 });
    return NextResponse.json({
      sessionToken: result.session_token, expiresAt: result.expires_at,
      expiresIn: result.expires_in || 3600, apiUrl,
      userId: access.userId, role: access.isLecturer ? 'tutor' : 'student',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('StudyMind session exchange failed', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Unable to connect to StudyMind AI' }, { status: 502 });
  }
}
