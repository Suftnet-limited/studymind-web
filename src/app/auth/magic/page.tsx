'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type State = 'verifying' | 'success' | 'error';

export default function MagicPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<State>('verifying');
  const [errorMsg, setErrorMsg] = useState('This link has expired or has already been used.');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = params.get('token');
    const redirect = params.get('redirect') ?? '/billing';

    if (!token) {
      setErrorMsg('No token found in this link.');
      setState('error');
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/studymind/auth/magic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          setState('success');
          // Short pause so the user sees the success message, then redirect
          setTimeout(() => { router.push(redirect); }, 1200);
        } else {
          let msg = 'This link has expired or has already been used.';
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) msg = data.error;
          } catch { /* ignore */ }
          setErrorMsg(msg);
          setState('error');
        }
      } catch {
        setErrorMsg('Something went wrong. Please try again.');
        setState('error');
      }
    })();
  }, [params, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {state === 'verifying' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-indigo-600" />
            <p className="text-sm font-medium text-zinc-600">Signing you in…</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 text-2xl">
              ✓
            </div>
            <p className="text-base font-semibold text-zinc-800">Signed in!</p>
            <p className="mt-1 text-sm text-zinc-500">Redirecting you now…</p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500 text-2xl">
              ✕
            </div>
            <p className="text-base font-semibold text-zinc-800">Link unavailable</p>
            <p className="mt-2 text-sm text-zinc-500">{errorMsg}</p>
            <Link
              href="/sign-in"
              className="mt-6 inline-block rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
