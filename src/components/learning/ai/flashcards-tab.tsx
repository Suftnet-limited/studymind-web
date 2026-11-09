'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { FlashcardDeck } from '@/lib/learning-ai.mjs';
import { Button } from '@/components/ui/button';
import { ErrorBox } from '@/components/learning/states';
import { GenerateState, TopicField, errorText } from './shared';
import { cn } from '@/lib/utils';

/** Flashcards: generated from the module's material; flip each card and move through the set. */
export function FlashcardsTab({ moduleId }: { moduleId: string }) {
  const [topic, setTopic] = useState('');
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try { const d = await studyMindAiService.generateFlashcards(moduleId, { topic: topic.trim() || undefined }); setDeck(d); setIndex(0); setFlipped(false); }
    catch (e) { setError(errorText(e, 'Unable to generate flashcards')); }
    finally { setLoading(false); }
  }
  const card = deck?.cards[index];
  if (!deck || !card) return <GenerateState icon={<Layers className="size-8" />} text="Generate flashcards to memorise the key ideas in this module."
    buttonLabel="Generate flashcards" loadingLabel="Generating flashcards…" loading={loading} error={error} onGenerate={generate}>
    <TopicField id="cards-topic" value={topic} onChange={setTopic} disabled={loading} />
    {deck && !deck.cards.length && <ErrorBox message="No flashcards could be generated from the current material." />}
  </GenerateState>;

  const go = (delta: number) => { setIndex(i => Math.min(deck.cards.length - 1, Math.max(0, i + delta))); setFlipped(false); };
  return <div className="space-y-3">
    <p data-testid="card-counter" className="text-center text-xs text-zinc-500" aria-live="polite">Card {index + 1} of {deck.cards.length}</p>
    <button type="button" onClick={() => setFlipped(f => !f)} aria-label={flipped ? 'Show question' : 'Reveal answer'} data-testid="flashcard"
      className={cn('flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border p-6 text-center transition', flipped ? 'border-violet-400 bg-violet-50' : 'border-zinc-200 bg-white hover:bg-zinc-50')}>
      <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{flipped ? 'Answer' : 'Question'}</span>
      <span className="break-words text-lg font-semibold leading-snug">{flipped ? card.back : card.front}</span>
      <span className="mt-3 text-xs text-zinc-400">Tap to {flipped ? 'see the question' : 'reveal the answer'}</span>
    </button>
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" onClick={() => go(-1)} disabled={index === 0}><ChevronLeft className="size-4" aria-hidden /> Previous</Button>
      <Button className="flex-1" onClick={() => go(1)} disabled={index === deck.cards.length - 1}>Next <ChevronRight className="size-4" aria-hidden /></Button>
    </div>
    {error && <ErrorBox message={error} />}
    <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-3">
      <div className="min-w-48 flex-1"><TopicField id="cards-topic" value={topic} onChange={setTopic} disabled={loading} /></div>
      <Button variant="outline" onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate a new set'}</Button>
    </div>
  </div>;
}
