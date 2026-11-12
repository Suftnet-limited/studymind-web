// Cross-site request check for cookie-authenticated, state-changing routes (delete a chat, start a checkout).
// 1. Browsers send Sec-Fetch-Site on every request and page scripts cannot forge it: trust it when present.
// 2. Otherwise (older browsers, non-browser clients) compare Origin with the Host the client used. The Host header is used,
//    not request.url: in development and behind proxies request.url can carry a different hostname than the browser's.
// A request with neither header is not a browser cross-site request (browsers do not attach our SameSite=Lax cookies to those).
export function isCrossSite(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site) return !['same-origin', 'same-site', 'none'].includes(site);
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  try { return !host || new URL(origin).host.toLowerCase() !== host; } catch { return true; }
}
