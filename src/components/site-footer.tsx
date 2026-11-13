'use client';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isWideRoute } from '@/lib/wide-route';

export function SiteFooter() {
  const wide = isWideRoute(usePathname());
  return <footer className="border-t border-zinc-100 bg-white py-8"><div className={cn('mx-auto flex flex-wrap px-5 items-center justify-between gap-2 text-sm text-zinc-500', wide ? 'max-w-[88rem]' : 'max-w-6xl')}><span>© {new Date().getFullYear()} StudyMind</span><span>Learn smarter. Teach better.</span></div></footer>;
}
