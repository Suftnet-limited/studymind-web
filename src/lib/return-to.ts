/**
 * "Return to" support for the sign-in wall: a page sends signed-out visitors to /my-learning?next=<path>, and sign-in or
 * registration sends them back there. `next` comes from the URL, so it is untrusted: only same-site paths inside
 * /my-learning/ are accepted (no other origin, no protocol-relative //host, no backslash tricks, no ../ escapes).
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(raw) || !raw.startsWith('/my-learning/')) return null;
  try {
    const url = new URL(raw, 'http://return-to.invalid');
    if (url.origin !== 'http://return-to.invalid' || !url.pathname.startsWith('/my-learning/') || url.pathname.includes('//')) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

/** The validated ?next= of the current page (browser only). */
export const currentNext = () => (typeof window === 'undefined' ? null : safeNext(new URLSearchParams(window.location.search).get('next')));

/** `href` carrying `next` along, so moving between Sign in and Create account keeps the destination. */
export const withNext = (href: string, next: string | null) => (next ? `${href}?next=${encodeURIComponent(next)}` : href);
