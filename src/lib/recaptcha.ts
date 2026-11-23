/** Verifies a reCAPTCHA v3 token server-side. Returns true when the visitor looks human (score >= 0.5). */
export async function verifyRecaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // not configured (local dev / tests): skip
  if (!token) return false;

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // URLSearchParams encodes both values: the token comes from the client, so a token containing "&secret=..."
      // must not be able to add a second `secret` parameter and make Google verify against the attacker's own key.
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true && typeof data.score === 'number' && data.score >= 0.5;   // v3: >= 0.5 is considered human
  } catch {
    // Google unreachable, slow or returned junk: fail closed with the normal "try again" message instead of a 500.
    return false;
  }
}
