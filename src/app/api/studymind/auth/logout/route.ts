import { NextResponse } from 'next/server';
import { revokeAiSession } from '@/lib/studymind-identity';
export const runtime = 'nodejs';
export async function POST() {
  await revokeAiSession();
  return NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
}
