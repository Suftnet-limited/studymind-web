'use client';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChatTab } from './chat-tab';
import { QuizTab } from './quiz-tab';
import { FlashcardsTab } from './flashcards-tab';
import { SummaryTab } from './summary-tab';

const TABS = [
  { id: 'documents', label: 'Documents' }, { id: 'chat', label: 'Chat' }, { id: 'quiz', label: 'Quiz' },
  { id: 'flashcards', label: 'Flashcards' }, { id: 'summary', label: 'Summary' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * The module's sections: Documents (upload and materials) and the four AI learning features. Every panel stays mounted so a chat
 * or a quiz survives tab changes. Chat is the default; its "no materials yet" hint, the paperclip and the suggestion chips jump to other sections.
 */
export function StudyTools({ moduleId, hasMaterials, documents, userName }: { moduleId: string; hasMaterials: boolean; documents: ReactNode; userName: string }) {
  const [tab, setPicked] = useState<TabId>('chat');
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault(); setPicked(TABS[next].id); document.getElementById(`ai-tab-${TABS[next].id}`)?.focus();
  };
  return <section aria-labelledby="study-tools-title" className="space-y-5">
    <h2 id="study-tools-title" className="sr-only">Study tools</h2>
    {/* font sizes use `!` because the global unlayered `button{font:inherit}` rule otherwise beats every Tailwind font utility */}
    <div role="tablist" aria-label="Module sections" className="flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-zinc-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5">
      {TABS.map((t, i) => <button key={t.id} id={`ai-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`ai-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
        onClick={() => setPicked(t.id)} onKeyDown={e => move(e, i)}
        className={cn('relative -mb-px flex-auto whitespace-nowrap rounded-t-xl px-[3px] min-[360px]:px-1 py-2.5 text-center font-semibold! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 text-[length:11px]! min-[360px]:text-[length:12px]! min-[390px]:text-[length:13px]! sm:flex-none sm:px-5 sm:text-[15px]!',
          tab === t.id ? 'bg-violet-50 text-violet-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-violet-600' : 'text-zinc-600 hover:bg-zinc-50 hover:text-violet-700')}>{t.label}</button>)}
    </div>
    <div id="ai-panel-documents" role="tabpanel" aria-labelledby="ai-tab-documents" hidden={tab !== 'documents'}>{documents}</div>
    <div id="ai-panel-chat" role="tabpanel" aria-labelledby="ai-tab-chat" hidden={tab !== 'chat'}><ChatTab moduleId={moduleId} hasMaterials={hasMaterials} userName={userName}
      onOpenTool={(t) => { setPicked(t); document.getElementById(`ai-tab-${t}`)?.focus(); }} /></div>
    <div id="ai-panel-quiz" role="tabpanel" aria-labelledby="ai-tab-quiz" hidden={tab !== 'quiz'}><QuizTab moduleId={moduleId} /></div>
    <div id="ai-panel-flashcards" role="tabpanel" aria-labelledby="ai-tab-flashcards" hidden={tab !== 'flashcards'}><FlashcardsTab moduleId={moduleId} /></div>
    <div id="ai-panel-summary" role="tabpanel" aria-labelledby="ai-tab-summary" hidden={tab !== 'summary'}><SummaryTab moduleId={moduleId} /></div>
  </section>;
}
