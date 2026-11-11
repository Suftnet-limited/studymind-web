import Image from 'next/image';
import './landing.css';

const HIGHLIGHTS = [
  { icon: '/landing/icon-students.svg', title: 'For students', text: 'Study, practise and make progress.' },
  { icon: '/landing/icon-lecturers.svg', title: 'For lecturers', text: 'Create, share and support learning.' },
  { icon: '/landing/icon-privacy.svg', title: 'Secure & private', text: 'Your materials and data stay protected.' },
] as const;

/** Three short highlights under the hero. No statistics, ratings or testimonials. */
export function LandingHighlights() {
  return <section aria-labelledby="highlights-title" className="sm-landing bg-white">
    <h2 id="highlights-title" className="sr-only">Why StudyMind</h2>
    <ul className="mx-auto grid max-w-6xl divide-y divide-[var(--sm-border)] px-5 py-4 md:grid-cols-3 md:divide-x md:divide-y-0 md:py-10">
      {HIGHLIGHTS.map(({ icon, title, text }) => <li key={title} className="flex items-center gap-4 py-6 md:justify-center md:px-8 md:py-2">
        <Image src={icon} alt="" aria-hidden width={32} height={32} unoptimized className="size-9 shrink-0" />
        <div>
          <h3 className="text-lg font-bold text-[var(--sm-ink)]">{title}</h3>
          <p className="mt-0.5 text-sm text-[var(--sm-muted)]">{text}</p>
        </div>
      </li>)}
    </ul>
  </section>;
}
