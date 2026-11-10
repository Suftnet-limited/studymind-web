'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Account links for visitors without a legacy web session. `initialSignedIn` is a server-side hint (a StudyMind AI
 * session cookie is present) so a signed-in user never sees "Sign in / Get started" flash; the status call then
 * confirms it, and corrects the header if the cookie turns out to be expired or invalid.
 */
export function HeaderAuth({ initialSignedIn }: { initialSignedIn: boolean }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch('/api/studymind/auth/status', { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setSignedIn(d?.authenticated === true); })
        .catch(() => { /* keep the server hint */ });
    };
    refresh();
    window.addEventListener('studymind-auth-changed', refresh);   // sign-in / sign-out without a route change
    return () => { cancelled = true; window.removeEventListener('studymind-auth-changed', refresh); };
  }, [pathname]);

  if (signedIn) return <Link className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700" href="/my-learning">Learning workspace</Link>;
  return <>
    <Link className="hidden hover:text-violet-700 sm:inline" href="/#features">Features</Link>
    <Link className="hidden hover:text-violet-700 sm:inline" href="/#how-it-works">How it works</Link>
    <Link href="/my-learning">Sign in</Link>
    <Link className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700" href="/my-learning/register">Get started</Link>
  </>;
}
