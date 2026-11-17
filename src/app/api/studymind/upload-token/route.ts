import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

/**
 * GET /api/studymind/upload-token
 *
 * Returns a short-lived access token so the browser can upload files
 * directly to the AI backend (api.aismartlearner.com), bypassing Render's
 * 30-second request timeout. The token expires with the user's normal session.
 *
 * The response is never cached and the token must not be stored beyond the
 * single upload it was issued for.
 */
export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'no-store, no-cache', 'Pragma': 'no-cache' } },
  );
}
