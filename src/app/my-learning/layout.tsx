import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/my-learning', label: 'Learning workspace' },
  { href: '/modules', label: 'Web modules' },
  { href: '/billing', label: 'AI access' },
];
export default function MyLearningLayout({ children }: { children: ReactNode }) {
  return <div>
    <nav aria-label="Learning navigation" className="border-b border-zinc-100 bg-white">
      <ul className="mx-auto flex max-w-4xl gap-x-5 gap-y-1 overflow-x-auto px-5 py-2.5 text-sm font-medium text-zinc-600">
        {links.map(l => <li key={l.href} className="shrink-0"><Link className="hover:text-violet-700" href={l.href}>{l.label}</Link></li>)}
      </ul>
    </nav>
    {children}
  </div>;
}
