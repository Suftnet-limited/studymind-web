'use client';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';

/**
 * Clean, minimal full-screen shell for sign-in and registration.
 * Hides the site header and nav so the user is focused on the form.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const hidden = [...document.querySelectorAll<HTMLElement>('body > header, nav[aria-label="Learning navigation"]')];
    hidden.forEach((el) => el.setAttribute('inert', ''));
    return () => hidden.forEach((el) => el.removeAttribute('inert'));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#f8f7ff]" data-testid="auth-shell">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />

      {/* Minimal top bar with just the logo */}
      <div className="relative z-10 flex h-16 shrink-0 items-center px-6">
        <Link href="/" aria-label="Revvo home" className="text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 rounded-lg">
          <BrandMark className="text-xl" />
        </Link>
      </div>

      {/* Centred form */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <main className="w-full max-w-[400px]">
          {children}
        </main>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex h-14 shrink-0 items-center justify-center">
        <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Revvo</p>
      </div>
    </div>
  );
}
