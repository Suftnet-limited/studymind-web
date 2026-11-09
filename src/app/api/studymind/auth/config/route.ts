import { NextResponse } from 'next/server';
import { aiIdentityRequest } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

const KNOWN = ['student', 'lecturer', 'self_learner'];
/** Which account types the AI backend currently allows to self-register. Falls back to all known roles. */
export async function GET() {
  try {
    const upstream = await aiIdentityRequest('/api/auth/config');
    const data = upstream.ok ? await upstream.json().catch(() => null) : null;
    const roles = Array.isArray(data?.enabled_roles) ? data.enabled_roles.filter((r: unknown) => typeof r === 'string' && KNOWN.includes(r)) : [];
    return NextResponse.json({ enabled_roles: roles.length ? roles : KNOWN }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch { return NextResponse.json({ enabled_roles: KNOWN }); }
}
