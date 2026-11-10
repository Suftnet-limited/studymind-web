'use client';
import { useState, type KeyboardEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TutorTab } from './tutor-tab';
import { QuizTab } from './quiz-tab';
import { FlashcardsTab } from './flashcards-tab';
import { SummaryTab } from './summary-tab';

const TABS = [{ id: 'tutor', label: 'AI Tutor' }, { id: 'quiz', label: 'Quiz' }, { id: 'flashcards', label: 'Flashcards' }, { id: 'summary', label: 'Summary' }] as const;
type TabId = (typeof TABS)[number]['id'];

/** The four AI learning features for one module. Every panel stays mounted so a chat or quiz survives tab changes. */
export function StudyTools({ moduleId, hasMaterials }: { moduleId: string; hasMaterials: boolean }) {
  const [tab, setTab] = useState<TabId>('tutor');
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : null;
    if (next === null) return;
    e.preventDefault(); setTab(TABS[next].id); document.getElementById(`ai-tab-${TABS[next].id}`)?.focus();
  };
  return <Card>
    <CardHeader>
      <CardTitle>Study tools</CardTitle>
      <CardDescription>Ask questions, take quizzes, revise with flashcards and get summaries — all based on this module&apos;s materials{hasMaterials ? '' : ' (none are indexed yet)'}.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* font sizes use `!` because the global unlayered `button{font:inherit}` rule otherwise beats every Tailwind font-size utility; sm+ keeps the previous 16px */}
      <div role="tablist" aria-label="AI study tools" className="flex gap-0 overflow-x-auto border-b border-zinc-100 sm:gap-1">
        {TABS.map((t, i) => <button key={t.id} id={`ai-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`ai-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)} onKeyDown={e => move(e, i)}
          className={cn('flex-auto whitespace-nowrap border-b-2 px-1 py-2 text-center font-semibold transition text-xs! min-[360px]:px-1.5 min-[360px]:text-[length:13px]! sm:px-3 sm:text-base!', tab === t.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>{t.label}</button>)}
      </div>
      <div id="ai-panel-tutor" role="tabpanel" aria-labelledby="ai-tab-tutor" hidden={tab !== 'tutor'}><TutorTab moduleId={moduleId} hasMaterials={hasMaterials} /></div>
      <div id="ai-panel-quiz" role="tabpanel" aria-labelledby="ai-tab-quiz" hidden={tab !== 'quiz'}><QuizTab moduleId={moduleId} /></div>
      <div id="ai-panel-flashcards" role="tabpanel" aria-labelledby="ai-tab-flashcards" hidden={tab !== 'flashcards'}><FlashcardsTab moduleId={moduleId} /></div>
      <div id="ai-panel-summary" role="tabpanel" aria-labelledby="ai-tab-summary" hidden={tab !== 'summary'}><SummaryTab moduleId={moduleId} /></div>
    </CardContent>
  </Card>;
}
