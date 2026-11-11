import Link from 'next/link';
import type { ReactNode } from 'react';

// Every link here must work with the StudyMind sign-in alone. The older /dashboard, /modules and /billing pages need a
// separate legacy web session, which StudyMind sign-in never creates, so they are not linked from here.
const links = [
  { href: '/my-learning', label: 'My modules' },
  { href: '/my-learning/plans', label: 'Plans' },
  { href: '/my-learning/plans#allowances', label: 'AI access' },
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
