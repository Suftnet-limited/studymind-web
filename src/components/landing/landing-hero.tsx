import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import './landing.css';

export function LandingHero() {
  return <section aria-labelledby="landing-title" className="sm-landing relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)]">
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-8 lg:pb-24 lg:pt-16">
      <div className="relative z-10">
        <h1 id="landing-title" className="text-[1.6rem] font-bold leading-[1.15] tracking-[-0.01em] text-[var(--sm-ink)] sm:text-[2rem] lg:text-[2.4rem]">
          Smarter Learning.
        </h1>
        <p className="mt-6 max-w-[22rem] text-base leading-7 text-[var(--sm-muted)]">An AI-powered workspace to study, practise and stay organised.</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/my-learning/register"
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-[var(--sm-purple)] px-7 text-base font-semibold text-white transition hover:bg-[var(--sm-purple-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sm-purple)]">
            Get started free <ArrowRight className="size-5" aria-hidden />
          </Link>
        </div>

        {/* App store badges */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href="https://apps.apple.com/app/ciquis/id6741540140" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
            <Image src="/landing/app-store-badge.png" alt="Download on the App Store" width={140} height={47} className="h-[47px] w-auto" />
          </a>
          <a href="https://play.google.com/store/apps/details?id=com.suftnet.studymind" target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
            <Image src="/landing/google-play-badge.png" alt="Get it on Google Play" width={158} height={47} className="h-[47px] w-auto" />
          </a>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
        <Image src="/landing/hero-composition.webp" width={851} height={720} priority quality={82}
            sizes="(min-width: 1024px) 560px, (min-width: 640px) 560px, 92vw"
            alt="A smiling student in a purple hoodie holding notebooks, surrounded by study tools."
            className="h-auto w-full" />
      </div>
    </div>
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[length:100%_100%] bg-no-repeat sm:h-20" style={{ backgroundImage: 'url(/landing/bottom-wave.svg)', WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 30%, transparent 100%)', maskImage: 'linear-gradient(to bottom, #000 0%, #000 30%, transparent 100%)' }} />
  </section>;
}
