'use client';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { BookOpen, GraduationCap, MessagesSquare, Sparkles } from 'lucide-react';

/**
 * Full-screen split layout for sign-in and registration (adapted from Learnify's auth screens, in StudyMind's own identity).
 * It sits above the site header and the learning navigation, so those are made inert while it is shown: keyboard and screen-reader
 * users go straight to the form instead of tabbing through links they cannot see.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const hidden = [...document.querySelectorAll<HTMLElement>('body > header, nav[aria-label="Learning navigation"]')];
    hidden.forEach((el) => el.setAttribute('inert', ''));
    return () => hidden.forEach((el) => el.removeAttribute('inert'));
  }, []);
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f7fb]" data-testid="auth-shell">
    <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden style={{ backgroundImage: 'radial-gradient(circle, #dfe3ef 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
    <div className="pointer-events-none absolute -left-24 top-12 h-80 w-80 rounded-full bg-violet-100/70 blur-3xl" aria-hidden />
    <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-indigo-100/70 blur-3xl" aria-hidden />
    <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
      <main className="relative z-10 w-full max-w-[920px] overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_28px_80px_rgba(31,41,55,0.10)]">
        <div className="flex min-h-[600px]">
          <section className="relative hidden w-[42%] flex-col overflow-hidden border-r border-violet-100/70 bg-gradient-to-br from-[#f3efff] via-[#f5f3ff] to-[#eef2ff] p-9 lg:flex" aria-label="About StudyMind">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[42px] border-white/45" aria-hidden />
            <div className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-violet-100/50" aria-hidden />
            <Link href="/" className="relative z-10 flex items-center gap-3 text-lg font-extrabold tracking-tight text-violet-700">
              <span className="rounded-xl bg-violet-600 p-2 text-white shadow-[0_10px_25px_rgba(124,58,237,0.25)]"><BookOpen className="size-5" aria-hidden /></span>StudyMind
            </Link>
            <div className="relative z-10 my-auto py-12">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/70 bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 shadow-sm">
                <Sparkles className="size-3" aria-hidden /> Your AI study companion
              </span>
              <h2 className="mt-6 max-w-sm text-[2rem] font-extrabold leading-[1.15] tracking-tight text-slate-900">Learn smarter from your own materials.</h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">Upload your notes and slides, then ask questions, practise with quizzes and flashcards, and get summaries, all in one calm workspace.</p>
              <ul className="mt-8 space-y-3">
                <li className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/60 p-3.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><MessagesSquare className="size-[17px]" aria-hidden /></span>
                  <span><span className="block text-xs font-bold text-slate-800">Answers with citations</span><span className="mt-0.5 block text-[11px] text-slate-500">See exactly which of your documents an answer came from.</span></span>
                </li>
                <li className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/60 p-3.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><GraduationCap className="size-[18px]" aria-hidden /></span>
                  <span><span className="block text-xs font-bold text-slate-800">Built for students and lecturers</span><span className="mt-0.5 block text-[11px] text-slate-500">Private notes stay private; class material is shared with the class.</span></span>
                </li>
              </ul>
            </div>
            <p className="relative z-10 text-[11px] leading-5 text-slate-400">One account for StudyMind Web and Mobile.</p>
          </section>
          <section className="flex flex-1 flex-col justify-center bg-white px-6 py-10 sm:px-12 lg:px-14">
            <Link href="/" className="mb-8 flex items-center gap-2.5 text-base font-extrabold text-violet-700 lg:hidden">
              <span className="rounded-lg bg-violet-600 p-1.5 text-white"><BookOpen className="size-4" aria-hidden /></span>StudyMind
            </Link>
            <div className="w-full max-w-[360px] self-center">{children}</div>
          </section>
        </div>
      </main>
    </div>
  </div>;
}
