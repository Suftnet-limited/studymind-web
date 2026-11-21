'use client';
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { Outline } from '@/lib/learning-ai.mjs';
import { cn } from '@/lib/utils';
import { ChatTab } from './chat-tab';
import { QuizTab } from './quiz-tab';
import { FlashcardsTab } from './flashcards-tab';
import { SummaryTab } from './summary-tab';
import { AssignmentsTab } from './assignments-tab';

const TABS = [
  { id: 'documents', label: 'Documents' }, { id: 'chat', label: 'Chat' }, { id: 'quiz', label: 'Quiz' },
  { id: 'flashcards', label: 'Flashcards' }, { id: 'summary', label: 'Summary' },
  { id: 'assignments', label: 'Assignments' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * The module's sections: Documents (upload and materials) and the four AI learning features. Every panel stays mounted so a chat
 * or a quiz survives tab changes. Chat is the default; its "no materials yet" hint, the paperclip and the suggestion chips jump to other sections.
 */
export function StudyTools({ moduleId, hasMaterials, documents, userName, isOwner = false }: { moduleId: string; hasMaterials: boolean; documents: ReactNode; userName: string; isOwner?: boolean }) {
  const [tab, setPicked] = useState<TabId>('chat');
  // Topic suggestions (the module's weeks and indexed documents), shared by Quiz, Flashcards and Summary. Reloaded when one of those tabs opens, so new uploads show up.
  const [outline, setOutline] = useState<Outline | null>(null);
  const loadOutline = useCallback(async () => { try { setOutline(await studyMindAiService.outline(moduleId)); } catch { /* suggestions are optional: the free-text topic still works */ } }, [moduleId]);
  useEffect(() => { if (tab === 'chat' || tab === 'quiz' || tab === 'flashcards' || tab === 'summary') void loadOutline(); }, [tab, loadOutline]);
  // The strip scrolls on narrow screens (labels are never shrunk or clipped): bring the selected tab into view, horizontally only.
  useEffect(() => {
    const el = document.getElementById(`ai-tab-${tab}`), list = el?.parentElement;
    if (!el || !list) return;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = Math.max(0, left - 8);
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8;
  }, [tab]);
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault(); setPicked(TABS[next].id); document.getElementById(`ai-tab-${TABS[next].id}`)?.focus();
  };
  return <section aria-labelledby="study-tools-title" className="min-w-0 space-y-5">
    <h2 id="study-tools-title" className="sr-only">Study tools</h2>
    {/* font sizes use `!` because the global unlayered `button{font:inherit}` rule otherwise beats every Tailwind font utility */}
    <div role="tablist" aria-label="Module sections" className="relative flex w-full max-w-full gap-0.5 overflow-x-auto overflow-y-hidden border-b border-zinc-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5">
      {TABS.map((t, i) => <button key={t.id} id={`ai-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`ai-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
        onClick={() => setPicked(t.id)} onKeyDown={e => move(e, i)}
        className={cn('relative -mb-px shrink-0 grow whitespace-nowrap rounded-t-xl px-3 py-2.5 text-center font-semibold! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 text-[length:13px]! sm:grow-0 sm:px-5 sm:text-[15px]!',
          tab === t.id ? 'bg-violet-50 text-violet-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-violet-600' : 'text-zinc-600 hover:bg-zinc-50 hover:text-violet-700')}>{t.label}</button>)}
    </div>
    <div id="ai-panel-documents" role="tabpanel" aria-labelledby="ai-tab-documents" hidden={tab !== 'documents'}>{documents}</div>
    <div id="ai-panel-chat" role="tabpanel" aria-labelledby="ai-tab-chat" hidden={tab !== 'chat'}><ChatTab moduleId={moduleId} hasMaterials={hasMaterials} userName={userName} outline={outline}
      onOpenTool={(t) => { setPicked(t); document.getElementById(`ai-tab-${t}`)?.focus(); }} /></div>
    <div id="ai-panel-quiz" role="tabpanel" aria-labelledby="ai-tab-quiz" hidden={tab !== 'quiz'}><QuizTab moduleId={moduleId} outline={outline} /></div>
    <div id="ai-panel-flashcards" role="tabpanel" aria-labelledby="ai-tab-flashcards" hidden={tab !== 'flashcards'}><FlashcardsTab moduleId={moduleId} outline={outline} /></div>
    <div id="ai-panel-summary" role="tabpanel" aria-labelledby="ai-tab-summary" hidden={tab !== 'summary'}><SummaryTab moduleId={moduleId} outline={outline} /></div>
    <div id="ai-panel-assignments" role="tabpanel" aria-labelledby="ai-tab-assignments" hidden={tab !== 'assignments'}><AssignmentsTab moduleId={moduleId} isOwner={isOwner} /></div>
  </section>;
}
