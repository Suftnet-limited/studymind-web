'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isWideRoute } from '@/lib/wide-route';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CreditCard, GraduationCap, Home, Layers, LayoutGrid, LogOut, Sparkles, User } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';

type LegacyUser = { name: string; role: string } | null;
type NavItem = { href: string; label: string; icon: ReactNode; active: boolean };

function Logo() {
  return <Link href="/" className="flex shrink-0 items-center rounded-lg text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">
    <BrandMark className="h-8 w-auto sm:h-9" /><span className="sr-only">StudyMind</span>
  </Link>;
}

/** Icon + label pills. On small screens the label becomes screen-reader only so the bar always fits. */
function NavPills({ label, items, onNavigate }: { label: string; items: NavItem[]; onNavigate?: (href: string) => void }) {
  return <nav aria-label={label} className="flex items-center gap-1">
    {items.map(i => <Link key={i.href} href={i.href} aria-current={i.active ? 'page' : undefined} onClick={() => onNavigate?.(i.href)}
      className={cn('inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 md:px-3.5',
        i.active ? 'bg-violet-100 text-violet-700' : 'text-zinc-700 hover:bg-zinc-100 hover:text-violet-700')}>
      <span aria-hidden className="shrink-0">{i.icon}</span><span className="sr-only md:not-sr-only">{i.label}</span>
    </Link>)}
  </nav>;
}

/** Avatar with initials and a chevron that opens a small account menu. */
function AccountMenu({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const initials = initialsOf(name);
  return <div ref={box} className="relative ml-auto">
    <button ref={trigger} type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
      className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-violet-600 text-sm! font-bold! text-white">{initials || <User className="size-5" />}</span>
      <ChevronDown aria-hidden className={cn('size-4 text-zinc-500 transition-transform', open && 'rotate-180')} />
    </button>
    {open && <div role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_50px_rgba(76,29,149,0.12)]">
      <div className="px-3 py-2"><p className="truncate text-sm font-bold text-[#111034]">{name || 'Your account'}</p><p className="text-xs text-zinc-500">Signed in</p></div>
      <div className="my-1 h-px bg-zinc-100" />
      {children}
    </div>}
  </div>;
}
const menuItem = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm! font-semibold! text-zinc-700 transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none';

/**
 * The site header, shared by every page. Three states:
 *  - a legacy Web session (server-rendered user): the older Dashboard / modules / billing links;
 *  - a StudyMind AI session: My modules, Plans, AI access, plus the account menu. `initialSignedIn` is a server-side hint (the
 *    session cookies exist) so a signed-in user never sees "Sign in" flash; the status call then confirms it;
 *  - signed out: Features, How it works, Sign in, Get started.
 */
export function SiteHeader({ legacyUser, initialSignedIn }: { legacyUser: LegacyUser; initialSignedIn: boolean }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const [name, setName] = useState('');
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch('/api/studymind/auth/status', { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => r.json())
        // authenticated: null means the backend is unavailable - keep what the user sees rather than flipping to "signed out"
        .then((d) => { if (cancelled || typeof d?.authenticated !== 'boolean') return; setSignedIn(d.authenticated); setName(d.authenticated && typeof d.name === 'string' ? d.name : ''); })
        .catch(() => { /* keep the server hint */ });
    };
    refresh();
    window.addEventListener('studymind-auth-changed', refresh);   // sign-in / sign-out without a route change
    return () => { cancelled = true; window.removeEventListener('studymind-auth-changed', refresh); };
  }, [pathname]);
  const at = (p: string) => pathname === p || pathname.startsWith(p + '/');
  let body: ReactNode;
  if (legacyUser) {
    const items: NavItem[] = [
      { href: '/dashboard', label: 'Dashboard', icon: <Home className="size-5" />, active: at('/dashboard') },
      { href: '/modules', label: 'My modules', icon: <Layers className="size-5" />, active: at('/modules') },
      { href: '/my-learning', label: 'Learning workspace', icon: <LayoutGrid className="size-5" />, active: pathname === '/my-learning' },
      ...(legacyUser.role === 'LECTURER' ? [{ href: '/lecturer', label: 'Teaching', icon: <GraduationCap className="size-5" />, active: at('/lecturer') }] : []),
      { href: '/billing', label: 'AI access', icon: <Sparkles className="size-5" />, active: at('/billing') },
    ];
    body = <>
      <NavPills label="Main navigation" items={items} />
      <AccountMenu name={legacyUser.name}>
        <form action="/api/auth/logout" method="post"><button type="submit" role="menuitem" className={menuItem}><LogOut className="size-4" aria-hidden /> Sign out</button></form>
      </AccountMenu>
    </>;
  } else if (signedIn) {
    const items: NavItem[] = [
      { href: '/my-learning', label: 'Dashboard', icon: <LayoutGrid className="size-5" />, active: pathname === '/my-learning' || at('/my-learning/modules') },
      { href: '/my-learning/plans', label: 'Plans', icon: <CreditCard className="size-5" />, active: at('/my-learning/plans') },
      { href: '/my-learning/allowances', label: 'AI access', icon: <Sparkles className="size-5" />, active: at('/my-learning/allowances') },
    ];
    body = <>
      <NavPills label="Learning navigation" items={items} />
      <AccountMenu name={name}>
        <button type="button" role="menuitem" className={menuItem} onClick={async () => { try { await studyMindIdentityService.logout(); } catch { /* the cookies are cleared server-side either way */ } window.location.assign('/my-learning'); }}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </AccountMenu>
    </>;
  } else {
    body = <nav aria-label="Main navigation" className="ml-auto flex items-center gap-x-4 text-sm font-medium text-zinc-600 sm:gap-x-6">
      <Link className="hidden hover:text-violet-700 sm:inline" href="/#features">Features</Link>
      <Link className="hidden hover:text-violet-700 sm:inline" href="/#how-it-works">How it works</Link>
      <Link href="/my-learning">Sign in</Link>
      <Link className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700" href="/my-learning/register">Get started</Link>
    </nav>;
  }
  return <header className="border-b border-zinc-200/70 bg-white">
    <div className={cn('mx-auto flex h-[72px] items-center gap-2 px-5 sm:gap-3', isWideRoute(pathname) ? 'max-w-[88rem]' : 'max-w-6xl')}>
      <Logo />
      {(legacyUser || signedIn) && <span aria-hidden className="mx-1 hidden h-8 w-px bg-zinc-200 sm:block" />}
      {body}
    </div>
  </header>;
}
