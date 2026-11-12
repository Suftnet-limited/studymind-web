'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Lock, XCircle } from 'lucide-react';
import type { Outline } from '@/lib/learning-ai.mjs';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { QuizGenerated, QuizResult } from '@/lib/learning-ai.mjs';
import { ErrorBox } from '@/components/learning/states';
import { GenerateState, TopicPicker, errorText, when } from './shared';
import { HistoryRail, useHistory } from './history-rail';
import { GridLegend, NumberGrid, ProgressBar, SideCard, ToolLayout, ToolPanel, btnOutline, btnPrimary, type CellState } from './layout';
import { cn } from '@/lib/utils';

const LETTERS = 'ABCDEFGHIJ';

/**
 * Quiz: generated from the module's material and answered one question at a time. The correct answers and explanations
 * are NOT sent to the browser until the quiz is submitted; the results view reveals them.
 */
export function QuizTab({ moduleId, outline }: { moduleId: string; outline: Outline | null }) {
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const hist = useHistory(moduleId, 'quiz');
  const [quiz, setQuiz] = useState<QuizGenerated | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      setQuiz(await studyMindAiService.generateQuiz(moduleId, { topic: topic.trim() || undefined }));
      setNote(topic.trim() ? `Topic: ${topic.trim()}` : ''); setAnswers({}); setResult(null); setCurrent(0); void hist.refresh();
    } catch (e) { setError(errorText(e, 'Unable to generate a quiz')); }
    finally { setLoading(false); }
  }
  async function submit() {
    if (!quiz) return;
    setSubmitting(true); setError(null);
    try { setResult(await studyMindAiService.submitQuiz(moduleId, quiz.attempt_id, Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })))); void hist.refresh(); }
    catch (e) { setError(errorText(e, 'Unable to submit the quiz')); }
    finally { setSubmitting(false); }
  }
  const reset = () => { setQuiz(null); setResult(null); setAnswers({}); setCurrent(0); setError(null); };
  async function open(id: string) {
    if (id === quiz?.attempt_id) return;
    setOpening(id); setError(null);
    try {
      const d = await studyMindAiService.openHistory(moduleId, 'quiz', id);
      if (d.kind !== 'quiz') throw new Error('Unable to open this quiz');
      setQuiz(d.quiz); setAnswers(d.answers); setResult(d.result); setNote(d.created_at ? `Created ${when(d.created_at)}` : '');
      setCurrent(Math.max(0, d.quiz.questions.findIndex(q => !d.answers[q.id])));
    } catch (e) { setError(errorText(e, 'Unable to open this quiz')); }
    finally { setOpening(null); }
  }
  async function remove(id: string) {
    await studyMindAiService.deleteHistory(moduleId, 'quiz', id);
    if (id === quiz?.attempt_id) reset();
    await hist.refresh();
  }
  const rail = <HistoryRail kind="quiz" icon={<ClipboardList />} rows={hist.rows} error={hist.error} activeId={quiz?.attempt_id ?? null} opening={opening} busy={loading || submitting} onNew={reset} onOpen={id => void open(id)} onDelete={remove} />;

  if (!quiz || !quiz.questions.length) return <ToolLayout rail={rail} main={<ToolPanel icon={<ClipboardList className="size-5" />} title="Module quiz" subtitle="Test your understanding with questions built from this module's material.">
    <GenerateState icon={<ClipboardList className="size-8" />} text="Generate a multiple-choice quiz. You will see your score and an explanation for every question once you submit."
      buttonLabel="Generate quiz" loadingLabel="Generating quiz…" loading={loading} error={error} onGenerate={generate}>
      <TopicPicker outline={outline} id="quiz-topic" value={topic} onChange={setTopic} disabled={loading} />
      {quiz && !quiz.questions.length && <div className="mt-3"><ErrorBox message="No questions could be generated from the current material." /></div>}
    </GenerateState>
  </ToolPanel>} />;

  const questions = quiz.questions;
  const total = questions.length;
  const answered = questions.filter(q => answers[q.id]).length;
  const allAnswered = answered === total;
  const meta = `${total} ${total === 1 ? 'question' : 'questions'} · ${note || 'All material'}`;

  // ── Results ──
  if (result) {
    const review = new Map(result.questions.map(q => [q.id, q]));
    const states: CellState[] = questions.map(q => (review.get(q.id)?.is_correct ? 'correct' : 'wrong'));
    return <ToolLayout rail={rail}
      main={<ToolPanel icon={<CheckCircle2 className="size-5" />} title="Quiz results" subtitle={meta}>
        <div role="status" data-testid="quiz-score" className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5">
          <p className="text-2xl font-extrabold text-violet-800">Score: {Math.round(result.score)}%</p>
          <p className="mt-1 text-sm text-violet-900">{result.correct} of {result.total} correct</p>
        </div>
        <ol className="space-y-4">
          {questions.map((q, i) => {
            const r = review.get(q.id);
            return <li key={q.id} id={`quiz-q-${q.id}`} className="scroll-mt-24 rounded-2xl border border-zinc-200 p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Question {i + 1}</p>
              <p className="mt-1 text-base font-semibold leading-snug text-[#111034]">{q.question}</p>
              <ul className="mt-3 space-y-2">
                {q.options.map((o, k) => {
                  const chosen = answers[q.id] === o.id;
                  const isCorrect = !!r && o.id === r.correct_answer;
                  const isWrongPick = !!r && chosen && !r.is_correct;
                  return <li key={o.id} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
                    isCorrect ? 'border-emerald-300 bg-emerald-50' : isWrongPick ? 'border-red-300 bg-red-50' : chosen ? 'border-violet-300 bg-violet-50' : 'border-zinc-200 bg-white')}>
                    <span className="min-w-0 flex-1 break-words"><span className="mr-2 font-bold text-violet-700">{LETTERS[k]}.</span>{o.text}{chosen && !isWrongPick && !isCorrect && <span className="ml-2 text-xs text-zinc-500">(your answer)</span>}</span>
                    {isCorrect && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Correct answer" />}
                    {isWrongPick && <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Your answer was incorrect" />}
                  </li>;
                })}
              </ul>
              {r?.explanation && <p className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700"><span className="font-semibold">Explanation:</span> {r.explanation}</p>}
            </li>;
          })}
        </ol>
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      </ToolPanel>}
      side={<SideCard title="Questions" right={<span className="text-sm font-semibold text-zinc-500">{result.correct} of {result.total} correct</span>}>
        <NumberGrid label="Jump to a question" noun="Question" states={states} onSelect={i => document.getElementById(`quiz-q-${questions[i].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        <GridLegend items={[{ label: 'Correct', dot: 'bg-emerald-400' }, { label: 'Incorrect', dot: 'bg-red-400' }]} />
        <button type="button" onClick={reset} className={cn(btnPrimary, 'mt-5 w-full')}>Generate a new quiz</button>
      </SideCard>} />;
  }

  // ── Taking the quiz ──
  const q = questions[current];
  const states: CellState[] = questions.map((x, i) => (i === current ? 'current' : answers[x.id] ? 'done' : 'idle'));
  const last = current === total - 1;
  return <ToolLayout rail={rail}
    main={<ToolPanel icon={<ClipboardList className="size-5" />} title="Module quiz" subtitle={meta}>
      <div className="flex items-center gap-4">
        <p className="shrink-0 text-sm font-bold text-[#111034]">Question {current + 1} of {total}</p>
        <ProgressBar value={current + 1} max={total} label="Position in the quiz" className="flex-1" />
      </div>
      <fieldset key={q.id} className="mt-6 min-w-0">
        <legend className="text-xl font-bold leading-snug text-[#111034]">{q.question}</legend>
        <div className="mt-5 space-y-3">
          {q.options.map((o, k) => {
            const chosen = answers[q.id] === o.id;
            return <label key={o.id} className={cn('flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3.5 text-[15px] leading-6 transition focus-within:ring-2 focus-within:ring-violet-300',
              chosen ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200' : 'border-zinc-200 bg-white hover:border-violet-200 hover:bg-violet-50/40')}>
              <input type="radio" name={q.id} value={o.id} checked={chosen} className="size-5 shrink-0 accent-violet-600" onChange={() => setAnswers(a => ({ ...a, [q.id]: o.id }))} />
              <span className="min-w-0 flex-1 break-words"><span className="mr-2 font-bold text-violet-700">{LETTERS[k]}.</span>{o.text}</span>
            </label>;
          })}
        </div>
      </fieldset>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={btnOutline} onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}><ArrowLeft className="size-4" aria-hidden /> Previous</button>
        {last
          ? <div className="flex flex-wrap items-center justify-end gap-3">
              {!allAnswered && <span className="text-xs text-zinc-500">Answer every question to submit ({total - answered} left).</span>}
              <button type="button" className={btnPrimary} onClick={submit} disabled={!allAnswered || submitting}>{submitting ? 'Submitting…' : 'Submit quiz'}</button>
            </div>
          : <button type="button" className={btnPrimary} onClick={() => setCurrent(c => Math.min(total - 1, c + 1))}>Next <ArrowRight className="size-4" aria-hidden /></button>}
      </div>
    </ToolPanel>}
    side={<SideCard title="Questions" right={<span className="text-sm font-semibold text-zinc-500">{answered} of {total} answered</span>}>
      <NumberGrid label="Jump to a question" noun="Question" states={states} onSelect={setCurrent} />
      <GridLegend items={[{ label: 'Answered', dot: 'bg-emerald-400' }, { label: 'Current', dot: 'bg-violet-500' }]} />
      <p className="mt-4 flex items-start gap-2 border-t border-zinc-100 pt-4 text-xs leading-5 text-zinc-500"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Your score and explanations appear after you submit.</p>
    </SideCard>} />;
}
