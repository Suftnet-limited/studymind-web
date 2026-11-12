'use client';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { SummaryResult } from '@/lib/learning-ai.mjs';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/learning/copy-button';
import { ErrorBox } from '@/components/learning/states';
import { MarkdownRenderer } from './markdown';
import { GenerateState, TopicField, errorText } from './shared';
import { ToolPanel } from './layout';

/** Summary: an AI summary of the module's material, rendered from the structured response. */
export function SummaryTab({ moduleId }: { moduleId: string }) {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try { setSummary(await studyMindAiService.summarise(moduleId, { topic: topic.trim() || undefined })); }
    catch (e) { setError(errorText(e, 'Unable to generate a summary')); }
    finally { setLoading(false); }
  }
  if (!summary) return <ToolPanel icon={<FileText className="size-5" />} title="Summary" subtitle="A clear overview of this module's material."><GenerateState icon={<FileText className="size-8" />} text="Generate an AI summary of this module's material."
    buttonLabel="Generate summary" loadingLabel="Generating summary…" loading={loading} error={error} onGenerate={generate}>
    <TopicField id="summary-topic" value={topic} onChange={setTopic} disabled={loading} label="Summarise a topic (optional)" />
  </GenerateState></ToolPanel>;
  return <ToolPanel icon={<FileText className="size-5" />} title="Summary" subtitle={summary.source_doc_count > 0 ? `Based on ${summary.source_doc_count} ${summary.source_doc_count === 1 ? 'document' : 'documents'}` : 'A clear overview of this module\'s material.'}><div className="space-y-3">
    <article aria-label="Summary" data-testid="summary" className="rounded-2xl border border-zinc-200 bg-white p-5"><MarkdownRenderer content={summary.content} /></article>
    {summary.advice && <aside aria-label="General study advice" data-testid="study-advice" className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">General study advice — not from your documents</p>
      <MarkdownRenderer content={summary.advice} />
    </aside>}
    {error && <ErrorBox message={error} />}
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton value={summary.content} label="Copy summary" />
      <Button variant="outline" size="sm" onClick={() => { setSummary(null); setError(null); }}>Regenerate</Button>
    </div>
  </div></ToolPanel>;
}
