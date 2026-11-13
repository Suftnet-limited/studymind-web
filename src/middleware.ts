import { NextResponse, type NextRequest } from 'next/server';

/**
 * The older web pages (/dashboard, /modules, /billing, /lecturer) are guarded by a separate legacy session cookie that
 * StudyMind sign-in never creates. Without this, a user signed in through /my-learning who opens one of them (a bookmark,
 * an old link, the lecturer button) is bounced to the legacy /sign-in page and believes they were logged out.
 *
 * A request that carries a StudyMind AI session but NO legacy session is sent to the equivalent StudyMind page instead.
 * Anyone with a legacy session, and anyone with no session at all, is untouched (the pages' own guards still apply).
 * This only redirects: it grants nothing, and does not touch the billing or Stripe routes (/api is not matched).
 */
const LEGACY_SESSION = 'studymind_session';
const AI_COOKIES = ['studymind_ai_access', 'studymind_ai_refresh'];

export function middleware(request: NextRequest) {
  const has = (name: string) => Boolean(request.cookies.get(name)?.value);
  if (has(LEGACY_SESSION) || !AI_COOKIES.some(has)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.search = '';
  if (request.nextUrl.pathname === '/billing') { url.pathname = '/my-learning/allowances'; }
  else { url.pathname = '/my-learning'; }
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/dashboard', '/modules/:path*', '/billing', '/lecturer/:path*'] };
