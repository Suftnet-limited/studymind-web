'use client';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { Outline } from '@/lib/learning-ai.mjs';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { SummaryResult } from '@/lib/learning-ai.mjs';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/learning/copy-button';
import { ErrorBox } from '@/components/learning/states';
import { MarkdownRenderer } from './markdown';
import { GenerateState, TopicPicker, errorText } from './shared';
import { HistoryRail, useHistory } from './history-rail';
import { ToolLayout, ToolPanel } from './layout';

/** Summary: an AI summary of the module's material. Earlier summaries are kept in the Recent list so any of them can be reviewed again. */
export function SummaryTab({ moduleId, outline }: { moduleId: string; outline: Outline | null }) {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hist = useHistory(moduleId, 'summary');

  async function generate() {
    setLoading(true); setError(null);
    try { setSummary(await studyMindAiService.summarise(moduleId, { topic: topic.trim() || undefined })); void hist.refresh(); }
    catch (e) { setError(errorText(e, 'Unable to generate a summary')); }
    finally { setLoading(false); }
  }
  const reset = () => { setSummary(null); setError(null); };
  async function open(id: string) {
    if (id === summary?.id) return;
    setOpening(id); setError(null);
    try {
      const d = await studyMindAiService.openHistory(moduleId, 'summary', id);
      if (d.kind !== 'summary') throw new Error('Unable to open this summary');
      setSummary(d.summary);
    } catch (e) { setError(errorText(e, 'Unable to open this summary')); }
    finally { setOpening(null); }
  }
  async function remove(id: string) {
    await studyMindAiService.deleteHistory(moduleId, 'summary', id);
    if (id === summary?.id) reset();
    await hist.refresh();
  }
  const rail = <HistoryRail kind="summary" icon={<FileText />} rows={hist.rows} error={hist.error} activeId={summary?.id ?? null} opening={opening} busy={loading} onNew={reset} onOpen={id => void open(id)} onDelete={remove} />;

  if (!summary) return <ToolLayout rail={rail} main={<ToolPanel icon={<FileText className="size-5" />} title="Summary" subtitle="A clear overview of this module's material.">
    <GenerateState icon={<FileText className="size-8" />} text="Generate an AI summary of this module's material."
      buttonLabel="Generate summary" loadingLabel="Generating summary…" loading={loading} error={error} onGenerate={generate}>
      <TopicPicker outline={outline} id="summary-topic" value={topic} onChange={setTopic} disabled={loading} label="Summarise a topic (optional)" />
    </GenerateState>
  </ToolPanel>} />;
  return <ToolLayout rail={rail} main={<ToolPanel icon={<FileText className="size-5" />} title="Summary" subtitle={summary.source_doc_count > 0 ? `Based on ${summary.source_doc_count} ${summary.source_doc_count === 1 ? 'document' : 'documents'}` : 'A clear overview of this module\'s material.'}><div className="space-y-3">
    <article aria-label="Summary" data-testid="summary" className="rounded-2xl border border-zinc-200 bg-white p-5"><MarkdownRenderer content={summary.content} /></article>
    {summary.advice && <aside aria-label="General study advice" data-testid="study-advice" className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">General study advice — not from your documents</p>
      <MarkdownRenderer content={summary.advice} />
    </aside>}
    {error && <ErrorBox message={error} />}
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton value={summary.content} label="Copy summary" />
      <Button variant="outline" size="sm" onClick={reset}>Regenerate</Button>
    </div>
  </div></ToolPanel>} />;
}
