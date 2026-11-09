import { NextResponse } from 'next/server';
import { authenticatedAiRequest } from '@/lib/studymind-identity';
import { parseEntitlements } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';

/**
 * Read-only proxy for the canonical AI entitlement API (`GET /api/auth/me/entitlements`, also served as `/api/me/entitlements`).
 * Responds `{ available: false }` if the backend is unreachable or returns nothing usable. This route never grants, changes or counts usage.
 */
export async function GET() {
  try {
    const upstream = await authenticatedAiRequest('/api/auth/me/entitlements');
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'private, no-store' } });
    const parsed = parseEntitlements(await upstream.json().catch(() => null));
    return NextResponse.json(parsed ? { available: true, ...parsed } : { available: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ available: false }); }
}
