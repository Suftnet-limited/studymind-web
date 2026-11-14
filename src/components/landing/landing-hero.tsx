'use client';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import './landing.css';

const VARIANTS = [
  {
    line1: 'Ask anything.',
    line2: 'Master everything.',
    sub: 'An AI-powered workspace to study, practise and stay organised.',
  },
  {
    line1: 'Learn smarter.',
    line2: 'Achieve more.',
    sub: 'An AI-powered workspace to study, practise and stay organised.',
  },
  {
    line1: 'Study better.',
    line2: 'Score higher.',
    sub: 'An AI-powered workspace to study, practise and stay organised.',
  },
  {
    line1: 'Revise faster.',
    line2: 'Remember longer.',
    sub: 'An AI-powered workspace to study, practise and stay organised.',
  },
];

export function LandingHero() {
  const [idx, setIdx] = useState(0);
  const v = VARIANTS[idx];

  return <section aria-labelledby="landing-title" className="sm-landing relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)]">
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-8 lg:pb-24 lg:pt-16">
      <div className="relative z-10">
        <h1 id="landing-title" className="text-[2.6rem] font-extrabold leading-[1.04] tracking-[-0.03em] text-[var(--sm-ink)] sm:text-6xl lg:text-[3.75rem]">
          {v.line1}
          <span className="relative mt-1 block w-fit text-[var(--sm-purple)]">
            {v.line2}
            <svg aria-hidden viewBox="0 0 260 14" preserveAspectRatio="none" className="absolute -bottom-2.5 left-1 h-3 w-[88%] text-[var(--sm-purple)]">
              <path d="M3 9C62 2 158 2 257 8" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </span>
        </h1>
        <p className="mt-8 max-w-[24.5rem] text-lg leading-8 text-[var(--sm-muted)]">{v.sub}</p>

        {/* Variant switcher dots */}
        <div className="mt-5 flex items-center gap-2" role="group" aria-label="Headline alternatives">
          {VARIANTS.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Headline option ${i + 1}`}
              className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sm-purple)] ${i === idx ? 'w-6 bg-[var(--sm-purple)]' : 'w-2 bg-zinc-300 hover:bg-zinc-400'}`} />
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/my-learning/register"
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-[var(--sm-purple)] px-7 text-base font-semibold text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)] transition hover:bg-[var(--sm-purple-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sm-purple)]">
            Get started free <ArrowRight className="size-5" aria-hidden />
          </Link>
          <Link href="/#how-it-works"
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl border border-[var(--sm-border)] bg-white px-7 text-base font-semibold text-[var(--sm-ink)] transition hover:border-[var(--sm-purple)] hover:text-[var(--sm-purple-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sm-purple)]">
            <PlayCircle className="size-5 text-[var(--sm-purple)]" aria-hidden /> See how it works
          </Link>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
        <Image src="/landing/hero-backdrop.svg" alt="" aria-hidden width={900} height={800} unoptimized
          className="pointer-events-none absolute -right-10 -top-10 w-[112%] max-w-none opacity-80 sm:-right-14" />
        <div className="relative overflow-hidden rounded-[28px] border border-white/80 shadow-[0_24px_60px_rgba(76,29,149,0.15)]">
          <Image src="/landing/hero-composition.webp" width={851} height={720} priority quality={82}
            sizes="(min-width: 1024px) 560px, (min-width: 640px) 560px, 92vw"
            alt="A smiling student in a purple hoodie holding notebooks, surrounded by three study tools: AI Tutor, Quizzes and Flashcards, and Smart Summaries."
            className="h-auto w-full" />
        </div>
      </div>
    </div>
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[length:100%_100%] bg-no-repeat sm:h-20" style={{ backgroundImage: 'url(/landing/bottom-wave.svg)', WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 30%, transparent 100%)', maskImage: 'linear-gradient(to bottom, #000 0%, #000 30%, transparent 100%)' }} />
  </section>;
}
