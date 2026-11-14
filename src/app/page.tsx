import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, BookOpen, Layers, MessageCircle, CheckCircle2,
  Zap, Users, ShieldCheck, Smartphone, GraduationCap, FileText,
} from 'lucide-react';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingHighlights } from '@/components/landing/landing-highlights';

export const metadata: Metadata = {
  title: 'Revvo — AI Study Companion for University Students',
  description:
    'Revvo turns your course materials into an AI tutor, quizzes, flashcards and smart summaries. Join your lecturer\'s module with a code and study smarter from day one.',
  keywords: [
    'AI study app', 'AI tutor for students', 'university study tool',
    'quiz generator from notes', 'flashcard maker', 'course summary AI',
    'study companion app', 'student revision app', 'AI for university',
    'lecture notes AI', 'smart summaries', 'exam preparation AI',
  ],
  openGraph: {
    type: 'website',
    title: 'Revvo — AI Study Companion for University Students',
    description:
      'Turn your course materials into an AI tutor, quizzes and summaries. Join your module with a code — study smarter from day one.',
    url: 'https://studymind-web.onrender.com',
    siteName: 'Revvo',
    images: [
      {
        url: '/landing/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Revvo — AI Study Companion',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Revvo — AI Study Companion for University Students',
    description: 'Turn your course materials into an AI tutor, quizzes and summaries.',
    images: ['/landing/og-image.png'],
  },
  alternates: {
    canonical: 'https://studymind-web.onrender.com',
  },
};

const FEATURES = [
  {
    Icon: MessageCircle,
    title: 'AI Tutor',
    description:
      'Ask anything about your course. Revvo answers from your module documents and cites the source — so you know exactly where to look.',
  },
  {
    Icon: Layers,
    title: 'Quizzes & Flashcards',
    description:
      'Generate practice questions and revision cards from any uploaded material in seconds. Covers MCQ, short answer and more.',
  },
  {
    Icon: BookOpen,
    title: 'Smart Summaries',
    description:
      'Get clear, structured summaries of a document, a week\'s content, or an entire module — ready to read and revise from.',
  },
  {
    Icon: FileText,
    title: 'AI Writing Assistant',
    description:
      'Draft essays, structure arguments and improve your writing with an AI that understands academic style and your course context.',
  },
  {
    Icon: Zap,
    title: 'Instant Answers',
    description:
      'No more scrolling through lecture slides. Ask a question in plain English and get a precise answer with a page reference.',
  },
  {
    Icon: Smartphone,
    title: 'Study Anywhere',
    description:
      'Access Revvo on the web or on your phone. Your modules, chats and study history stay in sync across every device.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Join your module',
    body: 'Enter the enrolment code your lecturer shared — by email, on the student portal, or in class. You\'re in instantly.',
  },
  {
    step: '02',
    title: 'Study with AI',
    body: 'Ask your AI tutor questions, generate a quiz, create flashcards, or get a summary — all from your actual course materials.',
  },
  {
    step: '03',
    title: 'Make progress',
    body: 'Track your activity streak, revisit past conversations and build on what you\'ve already covered each time you open the app.',
  },
];

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
  'Law', 'Economics', 'History', 'Psychology', 'Engineering',
  'Medicine', 'Business', 'Literature', 'Philosophy', 'Sociology',
];

export default function Home() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <LandingHero />

      {/* ── Highlights bar ───────────────────────────────────────────────── */}
      <LandingHighlights />

      {/* ── Features grid ────────────────────────────────────────────────── */}
      <section id="features" className="sm-landing mx-auto max-w-6xl px-5 py-20">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Everything you need to make progress
          </h2>
          <p className="mt-4 text-lg leading-7 text-zinc-600">
            Revvo works with the materials your lecturer already shares — no extra effort, just better results.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, description }) => (
            <div key={title}
              className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-violet-200">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Icon className="size-5" aria-hidden />
              </div>
              <h3 className="mb-2 text-base font-bold text-zinc-950">{title}</h3>
              <p className="text-sm leading-6 text-zinc-600">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-y border-violet-100 bg-violet-50/60">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
              Up and studying in three steps
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <div key={step} className="relative">
                <span className="text-5xl font-black text-violet-100 select-none">{step}</span>
                <h3 className="-mt-3 mb-2 text-lg font-bold text-zinc-950">{title}</h3>
                <p className="text-sm leading-6 text-zinc-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For lecturers ─────────────────────────────────────────────────── */}
      <section id="for-lecturers" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
              Share your materials. Let AI do the tutoring.
            </h2>
            <p className="mt-4 leading-7 text-zinc-600">
              Upload your lecture slides, notes and handouts. Revvo indexes them so your students can ask questions,
              generate quizzes and get summaries — all grounded in what you taught.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Create a module and upload your course materials',
                'Share a single enrolment code with your students',
                'AI answers are always grounded in your content',
                'Students access everything on web and mobile',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-zinc-700">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/my-learning/register"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800">
              Set up your first module <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="space-y-4">
            {[
              { Icon: GraduationCap, label: 'Lecturers upload once', sub: 'PDF, DOCX, TXT — up to 200 MB per file.' },
              { Icon: Users, label: 'Students join with a code', sub: 'One code per module, works on web and mobile.' },
              { Icon: ShieldCheck, label: 'Secure & private', sub: 'Your materials are never used to train AI models.' },
            ].map(({ Icon, label, sub }) => (
              <div key={label}
                className="flex items-center gap-4 rounded-xl border border-violet-100 bg-white p-5 shadow-sm">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{label}</p>
                  <p className="text-xs text-zinc-500">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Subject tags (SEO keyword surface) ───────────────────────────── */}
      <section className="border-t border-zinc-100 bg-white py-12">
        <div className="mx-auto max-w-6xl px-5">
          <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">
            Works across every subject
          </p>
          <ul className="flex flex-wrap justify-center gap-2" aria-label="Supported subjects">
            {SUBJECTS.map((s) => (
              <li key={s}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs font-medium text-zinc-600">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────────────── */}
      <section className="bg-violet-700 py-20 text-white">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Ready to study smarter?
          </h2>
          <p className="mt-4 text-lg text-violet-200">
            Join thousands of students using Revvo to make the most of their course materials.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/my-learning/register"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white px-8 text-base font-semibold text-violet-700 shadow-lg transition hover:bg-violet-50">
              Get started free <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link href="/#how-it-works"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-violet-500 px-8 text-base font-semibold text-white transition hover:border-white">
              See how it works
            </Link>
          </div>
          <p className="mt-5 text-sm text-violet-300">
            Also available on iOS and Android — study on the go.
          </p>
        </div>
      </section>
    </>
  );
}
