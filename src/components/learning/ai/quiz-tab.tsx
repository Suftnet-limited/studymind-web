'use client';
import { useState } from 'react';
import { CheckCircle2, ClipboardList, XCircle } from 'lucide-react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { QuizGenerated, QuizResult } from '@/lib/learning-ai.mjs';
import { Button } from '@/components/ui/button';
import { ErrorBox } from '@/components/learning/states';
import { GenerateState, TopicField, errorText } from './shared';
import { cn } from '@/lib/utils';

/** Quiz: generated from the module's material; results and explanations are revealed after submission. */
export function QuizTab({ moduleId }: { moduleId: string }) {
  const [topic, setTopic] = useState('');
  const [quiz, setQuiz] = useState<QuizGenerated | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try { setQuiz(await studyMindAiService.generateQuiz(moduleId, { topic: topic.trim() || undefined })); setAnswers({}); setResult(null); }
    catch (e) { setError(errorText(e, 'Unable to generate a quiz')); }
    finally { setLoading(false); }
  }
  async function submit() {
    if (!quiz) return;
    setSubmitting(true); setError(null);
    try { setResult(await studyMindAiService.submitQuiz(moduleId, quiz.attempt_id, Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })))); }
    catch (e) { setError(errorText(e, 'Unable to submit the quiz')); }
    finally { setSubmitting(false); }
  }

  if (!quiz || !quiz.questions.length) return <GenerateState icon={<ClipboardList className="size-8" />} text="Test your knowledge with a quiz built from this module's material."
    buttonLabel="Generate quiz" loadingLabel="Generating quiz…" loading={loading} error={error} onGenerate={generate}>
    <TopicField id="quiz-topic" value={topic} onChange={setTopic} disabled={loading} />
    {quiz && !quiz.questions.length && <ErrorBox message="No questions could be generated from the current material." />}
  </GenerateState>;

  const answered = quiz.questions.every(q => answers[q.id]);
  const review = result ? new Map(result.questions.map(q => [q.id, q])) : null;
  return <div className="space-y-4">
    {result && <div role="status" data-testid="quiz-score" className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-lg font-bold text-violet-800">Score: {Math.round(result.score)}%</p>
      <p className="text-sm text-violet-900">{result.correct} of {result.total} correct</p>
    </div>}
    {quiz.questions.map((q, i) => {
      const r = review?.get(q.id);
      return <fieldset key={q.id} className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4" disabled={!!result}>
        <legend className="px-1 text-sm font-semibold">{i + 1}. {q.question}</legend>
        {q.options.map(o => {
          const chosen = answers[q.id] === o.id;
          const isCorrect = !!r && o.id === r.correct_answer;
          const isWrongPick = !!r && chosen && !r.is_correct;
          return <label key={o.id} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm',
            isCorrect ? 'border-green-500 bg-green-50' : isWrongPick ? 'border-red-400 bg-red-50' : chosen ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 hover:bg-zinc-50')}>
            <input type="radio" name={q.id} value={o.id} checked={chosen} className="mt-1" onChange={() => setAnswers(a => ({ ...a, [q.id]: o.id }))} />
            <span className="flex-1">{o.text}</span>
            {isCorrect && <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label="Correct answer" />}
            {isWrongPick && <XCircle className="size-4 shrink-0 text-red-600" aria-label="Your answer was incorrect" />}
          </label>;
        })}
        {r?.explanation && <p className="text-xs text-zinc-600"><span className="font-semibold">Explanation:</span> {r.explanation}</p>}
      </fieldset>;
    })}
    {error && <ErrorBox message={error} />}
    {result
      ? <Button variant="outline" onClick={() => { setQuiz(null); setResult(null); setAnswers({}); }}>Generate a new quiz</Button>
      : <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={!answered || submitting}>{submitting ? 'Submitting…' : 'Submit quiz'}</Button>
          {!answered && <span className="text-xs text-zinc-500">Answer every question to submit.</span>}
        </div>}
  </div>;
}
