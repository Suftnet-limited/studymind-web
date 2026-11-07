import { NextResponse } from 'next/server';
import { clearAiTokens } from '@/lib/studymind-identity';
export const runtime = 'nodejs';
export async function POST() {
  await clearAiTokens();
  return NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
}
