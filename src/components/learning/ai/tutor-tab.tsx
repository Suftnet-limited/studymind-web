'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, MessageCircle, RotateCcw, Send } from 'lucide-react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { Citation, Complexity } from '@/lib/learning-ai.mjs';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from './markdown';
import { errorText } from './shared';
import { cn } from '@/lib/utils';

type Message = { id: number; role: 'user' | 'assistant'; content: string; sources?: Citation[]; noContent?: boolean; suggestions?: string[]; scope?: string; isError?: boolean };
const LEVELS: { value: Complexity; label: string }[] = [{ value: 'simple', label: 'Simple' }, { value: 'normal', label: 'Normal' }, { value: 'expert', label: 'Expert' }];
let nextId = 0;

/** AI Tutor: chat grounded in the module's materials, with source citations. */
export function TutorTab({ moduleId, hasMaterials }: { moduleId: string; hasMaterials: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [complexity, setComplexity] = useState<Complexity>('normal');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setSending(true);
    setMessages(m => [...m, { id: ++nextId, role: 'user', content: text }]);
    try {
      const res = await studyMindAiService.chat(moduleId, { message: text, session_id: sessionId, complexity });
      if (res.session_id) setSessionId(res.session_id);
      setMessages(m => [...m, { id: ++nextId, role: 'assistant', content: res.answer, sources: res.sources, noContent: res.no_content_found, suggestions: res.suggestions, scope: res.scope }]);
    } catch (e) {
      setMessages(m => [...m, { id: ++nextId, role: 'assistant', content: errorText(e, 'The AI Tutor could not answer. Please try again.'), isError: true }]);
    } finally { setSending(false); }
  }
  const newChat = () => { if (sending || !messages.length) return; setMessages([]); setSessionId(null); };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="radiogroup" aria-label="Answer complexity" className="flex gap-1.5">
        {LEVELS.map(l => <button key={l.value} type="button" role="radio" aria-checked={complexity === l.value} disabled={sending} onClick={() => setComplexity(l.value)}
          className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition', complexity === l.value ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50')}>{l.label}</button>)}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={newChat} disabled={sending || !messages.length}><RotateCcw className="size-4" aria-hidden /> New chat</Button>
    </div>

    <div ref={listRef} role="log" aria-live="polite" aria-label="Conversation" className="max-h-[28rem] min-h-48 space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
      {messages.length === 0 && <div className="py-8 text-center text-sm text-zinc-500">
        <MessageCircle className="mx-auto mb-2 size-8 text-zinc-400" aria-hidden />
        <p>Ask a question about this module.</p>
        {!hasMaterials && <p className="mt-1 text-xs">No indexed study material yet, so answers may be limited. Upload documents first for grounded answers.</p>}
      </div>}
      {messages.map(m => m.role === 'user'
        ? <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-violet-600 px-4 py-2.5 text-sm text-white">{m.content}</div>
        : m.isError
          ? <div key={m.id} role="alert" className="max-w-[90%] rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{m.content}</div>
          : <div key={m.id} className="max-w-[92%] space-y-2">
              <div className="rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3"><MarkdownRenderer content={m.content} /></div>
              {m.noContent && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p>No matching study material was found for this question.</p>
                {!!m.suggestions?.length && <ul className="mt-1 list-disc pl-4">{m.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>}
              </div>}
              {!!m.sources?.length && <div className="flex flex-wrap items-center gap-1.5" aria-label="Sources">
                <span className="text-xs font-medium text-zinc-500">Sources:</span>
                {m.sources.map(s => <span key={s.filename} title={s.snippet} data-testid="citation" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><FileText className="size-3" aria-hidden />{s.filename}</span>)}
              </div>}
            </div>)}
      {sending && <div role="status" className="max-w-[60%] rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-500">Thinking…</div>}
    </div>

    <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void send(); }}>
      <textarea aria-label="Ask a question" rows={2} maxLength={2000} value={input} onChange={e => setInput(e.target.value)} placeholder="Ask a question…"
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
        className="min-h-11 flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-violet-500" />
      <Button type="submit" aria-label="Send question" disabled={sending || !input.trim()}><Send className="size-4" aria-hidden /> Send</Button>
    </form>
  </div>;
}
