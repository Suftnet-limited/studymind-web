'use client';
import { useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Layers, RotateCcw } from 'lucide-react';
import type { Outline } from '@/lib/learning-ai.mjs';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { FlashcardDeck } from '@/lib/learning-ai.mjs';
import { ErrorBox } from '@/components/learning/states';
import { GenerateState, TopicPicker, errorText, when } from './shared';
import { HistoryRail, useHistory } from './history-rail';
import { GridLegend, NumberGrid, ProgressBar, SideCard, ToolLayout, ToolPanel, btnOutline, btnPrimary, type CellState } from './layout';
import { cn } from '@/lib/utils';

/** Flashcards: generated from the module's material. Flip each card, move through the set, and see which cards you have reviewed. */
export function FlashcardsTab({ moduleId, outline }: { moduleId: string; outline: Outline | null }) {
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const hist = useHistory(moduleId, 'flashcards');
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const d = await studyMindAiService.generateFlashcards(moduleId, { topic: topic.trim() || undefined });
      setDeck(d); setNote(topic.trim() ? `Topic: ${topic.trim()}` : ''); setIndex(0); setFlipped(false); setReviewed(new Set()); void hist.refresh();
    } catch (e) { setError(errorText(e, 'Unable to generate flashcards')); }
    finally { setLoading(false); }
  }
  const reset = () => { setDeck(null); setIndex(0); setFlipped(false); setReviewed(new Set()); setError(null); };
  async function open(id: string) {
    if (id === deck?.deck_id) return;
    setOpening(id); setError(null);
    try {
      const d = await studyMindAiService.openHistory(moduleId, 'flashcards', id);
      if (d.kind !== 'flashcards') throw new Error('Unable to open this set');
      setDeck(d.deck); setNote(d.created_at ? `Created ${when(d.created_at)}` : ''); setIndex(0); setFlipped(false); setReviewed(new Set());
    } catch (e) { setError(errorText(e, 'Unable to open this set')); }
    finally { setOpening(null); }
  }
  async function remove(id: string) {
    await studyMindAiService.deleteHistory(moduleId, 'flashcards', id);
    if (id === deck?.deck_id) reset();
    await hist.refresh();
  }
  const rail = <HistoryRail kind="flashcards" icon={<Layers />} rows={hist.rows} error={hist.error} activeId={deck?.deck_id ?? null} opening={opening} busy={loading} onNew={reset} onOpen={id => void open(id)} onDelete={remove} />;
  const card = deck?.cards[index];
  if (!deck || !card) return <ToolLayout rail={rail} main={<ToolPanel icon={<Layers className="size-5" />} title="Flashcards" subtitle="Memorise the key ideas in this module.">
    <GenerateState icon={<Layers className="size-8" />} text="Generate a set of flashcards from this module's material. Flip each card to check yourself."
      buttonLabel="Generate flashcards" loadingLabel="Generating flashcards…" loading={loading} error={error} onGenerate={generate}>
      <TopicPicker outline={outline} id="cards-topic" value={topic} onChange={setTopic} disabled={loading} />
      {deck && !deck.cards.length && <div className="mt-3"><ErrorBox message="No flashcards could be generated from the current material." /></div>}
    </GenerateState>
  </ToolPanel>} />;

  const total = deck.cards.length;
  const goTo = (i: number) => { if (i < 0 || i >= total) return; setIndex(i); setFlipped(false); };
  const flip = () => { setFlipped(f => !f); setReviewed(r => (r.has(index) ? r : new Set(r).add(index))); };
  const states: CellState[] = deck.cards.map((_, i) => (i === index ? 'current' : reviewed.has(i) ? 'done' : 'idle'));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
  };

  const meta = `${total} ${total === 1 ? 'card' : 'cards'} · ${note || 'All material'}`;
  return <ToolLayout rail={rail}
    main={<ToolPanel icon={<Layers className="size-5" />} title="Flashcards" subtitle={meta}>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span data-testid="card-counter" aria-live="polite" className="font-bold text-[#111034]">Card {index + 1} of {total}</span>
        <span className="font-semibold text-zinc-500">{reviewed.size} reviewed</span>
      </div>
      <ProgressBar value={reviewed.size} max={total} label="Cards reviewed" className="mt-3" />
      <button type="button" onClick={flip} onKeyDown={onKey} aria-label={flipped ? 'Show question' : 'Reveal answer'} aria-keyshortcuts="ArrowLeft ArrowRight" data-testid="flashcard"
        className={cn('mt-6 flex min-h-64 w-full flex-col items-center justify-center rounded-3xl border p-7 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:min-h-72',
          flipped ? 'border-violet-300 bg-gradient-to-br from-violet-50 to-indigo-50' : 'border-zinc-200 bg-white hover:border-violet-200 hover:bg-violet-50/30')}>
        <span className={cn('mb-4 rounded-full px-3 py-1 text-xs! font-bold! uppercase tracking-wider', flipped ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-600')}>{flipped ? 'Answer' : 'Question'}</span>
        <span className="break-words text-xl! font-bold! leading-snug text-[#111034] sm:text-2xl!">{flipped ? card.back : card.front}</span>
        <span className="mt-5 inline-flex items-center gap-1.5 text-xs! text-zinc-400"><RotateCcw className="size-3.5" aria-hidden /> Tap to {flipped ? 'see the question' : 'reveal the answer'}</span>
      </button>
      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" className={btnOutline} onClick={() => goTo(index - 1)} disabled={index === 0}><ArrowLeft className="size-4" aria-hidden /> Previous</button>
        <button type="button" className={btnPrimary} onClick={() => goTo(index + 1)} disabled={index === total - 1}>Next <ArrowRight className="size-4" aria-hidden /></button>
      </div>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
    </ToolPanel>}
    side={<SideCard title="Cards">
      <NumberGrid label="Jump to a card" noun="Card" states={states} onSelect={goTo} />
      <GridLegend items={[{ label: 'Reviewed', dot: 'bg-emerald-400' }, { label: 'Current', dot: 'bg-violet-500' }]} />
      <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
        <TopicPicker outline={outline} id="cards-topic" value={topic} onChange={setTopic} disabled={loading} />
        <button type="button" className={cn(btnOutline, 'w-full')} onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate a new set'}</button>
      </div>
    </SideCard>} />;
}
