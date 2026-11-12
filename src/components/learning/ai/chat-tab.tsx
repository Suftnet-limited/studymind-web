'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FileText, MessageCircle, MoreVertical, Paperclip, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { ChatSessionSummary, Citation, Complexity, Scope } from '@/lib/learning-ai.mjs';
import { initialsOf } from '@/lib/initials';
import { MarkdownRenderer } from './markdown';
import { clock, errorText, iconTone, when } from './shared';
import { btnOutline } from './layout';
import { cn } from '@/lib/utils';

type Message = { id: number; role: 'user' | 'assistant'; content: string; at: string; sources?: Citation[]; grounded?: boolean; noContent?: boolean; suggestions?: string[]; isError?: boolean };
type OpenTool = 'documents' | 'quiz' | 'flashcards' | 'summary';

const SOURCES: { value: Scope; label: string; hint: string; button: string }[] = [
  { value: 'everything', label: 'All module materials', hint: 'Class material and your own notes', button: 'Using module materials' },
  { value: 'class_only', label: 'Class material only', hint: 'What your lecturer shared', button: 'Using class material only' },
  { value: 'personal_only', label: 'My notes only', hint: 'Only what you uploaded yourself', button: 'Using my notes only' },
];
const LEVELS: { value: Complexity; label: string }[] = [{ value: 'simple', label: 'Simple' }, { value: 'normal', label: 'Normal' }, { value: 'expert', label: 'Expert' }];
let nextId = 0;

const nowIso = () => new Date().toISOString();

function CopyAnswer({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" aria-label={done ? 'Copied' : 'Copy answer'} title={done ? 'Copied' : 'Copy answer'}
    onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard not available */ } }}
    className="rounded-lg p-2 text-zinc-500 transition hover:bg-white hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
    {done ? <Check className="size-[18px] text-emerald-600" aria-hidden /> : <Copy className="size-[18px]" aria-hidden />}
  </button>;
}

/** "Using module materials" selector: which sources the answer may use, and how simple or expert it should be. */
function SourcesMenu({ scope, setScope, disabled }: { scope: Scope; setScope: (s: Scope) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    box.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const current = SOURCES.find(s => s.value === scope)!;
  const row = (checked: boolean) => cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none', checked && 'bg-violet-50/70');
  return <div ref={box} className="relative">
    <button ref={trigger} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
      className="inline-flex h-11 items-center gap-2.5 rounded-2xl border border-zinc-200 bg-white px-4 text-sm! font-semibold! text-zinc-700 shadow-sm transition hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60">
      <FileText className="size-5 text-violet-600" aria-hidden />{current.button}<ChevronDown className={cn('size-4 text-zinc-500 transition-transform', open && 'rotate-180')} aria-hidden />
    </button>
    {open && <div role="menu" aria-label="Answer sources" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_50px_rgba(76,29,149,0.12)]">
      <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Sources</p>
      {SOURCES.map(o => <button key={o.value} type="button" role="menuitemradio" aria-checked={scope === o.value} onClick={() => setScope(o.value)} className={row(scope === o.value)}>
        <Check className={cn('mt-0.5 size-4 shrink-0', scope === o.value ? 'text-violet-600' : 'text-transparent')} aria-hidden />
        <span><span className="block text-sm font-semibold text-[#111034]">{o.label}</span><span className="block text-xs text-zinc-500">{o.hint}</span></span>
      </button>)}
    </div>}
  </div>;
}

/**
 * Chat: a conversation grounded in the module's materials (with citations), plus the caller's own recent chats for this module.
 * History is private to the signed-in user and scoped to this module (the server enforces both).
 */
export function ChatTab({ moduleId, hasMaterials, userName, onOpenTool }: { moduleId: string; hasMaterials: boolean; userName: string; onOpenTool: (tool: OpenTool) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [complexity, setComplexity] = useState<Complexity>('normal');
  const [scope, setScope] = useState<Scope>('everything');
  const [chats, setChats] = useState<ChatSessionSummary[] | null>(null);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, sending]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-chat-menu]')) { setMenuFor(null); setConfirmFor(null); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuFor(null); setConfirmFor(null); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);

  const refreshChats = useCallback(async () => {
    try { setChats(await studyMindAiService.listChats(moduleId)); setChatsError(null); }
    catch (e) { setChatsError(errorText(e, 'Unable to load your chats')); setChats(c => c ?? []); }
  }, [moduleId]);
  useEffect(() => { void refreshChats(); }, [refreshChats]);

  const grow = () => { const el = inputRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; } };
  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); requestAnimationFrame(grow); setSending(true);
    setMessages(m => [...m, { id: ++nextId, role: 'user', content: text, at: nowIso() }]);
    try {
      const res = await studyMindAiService.chat(moduleId, { message: text, session_id: sessionId, complexity, scope_mode: scope });
      if (res.session_id) setSessionId(res.session_id);
      setMessages(m => [...m, { id: ++nextId, role: 'assistant', content: res.answer, at: nowIso(), sources: res.sources, grounded: res.grounded, noContent: res.no_content_found, suggestions: res.suggestions }]);
      void refreshChats();
    } catch (e) {
      setMessages(m => [...m, { id: ++nextId, role: 'assistant', content: errorText(e, 'The AI Tutor could not answer. Please try again.'), at: nowIso(), isError: true }]);
    } finally { setSending(false); }
  }
  const newChat = () => { if (sending) return; setMessages([]); setSessionId(null); setInput(''); setMenuFor(null); inputRef.current?.focus(); };
  async function openChat(id: string) {
    if (sending || opening) return;
    setOpening(id); setChatsError(null);
    try {
      const d = await studyMindAiService.openChat(moduleId, id);
      setMessages(d.messages.map(m => ({ id: ++nextId, role: m.role, content: m.content, at: m.created_at ?? nowIso(), sources: m.sources })));
      setSessionId(d.id); setRecentOpen(false);
    } catch (e) { setChatsError(errorText(e, 'Unable to open this chat')); void refreshChats(); }
    finally { setOpening(null); }
  }
  async function removeChat(id: string) {
    try { await studyMindAiService.deleteChat(moduleId, id); if (id === sessionId) { setMessages([]); setSessionId(null); } setChatsError(null); }
    catch (e) { setChatsError(errorText(e, 'Unable to delete this chat')); }
    finally { setMenuFor(null); setConfirmFor(null); void refreshChats(); }
  }

  const last = messages[messages.length - 1];
  const shown = chats ? (showAll ? chats : chats.slice(0, 5)) : [];
  const initials = initialsOf(userName);

  const recentList = <>
    {chats === null && <p role="status" className="px-1 py-3 text-sm text-zinc-500">Loading your chats…</p>}
    {chats && chats.length === 0 && !chatsError && <p className="px-1 py-3 text-sm leading-6 text-zinc-500">Your chats about this module will appear here.</p>}
    <ul className="space-y-1">
      {shown.map(c => <li key={c.id} data-chat-menu className="relative">
        <div className={cn('flex items-center gap-1 rounded-2xl pr-1 transition', c.id === sessionId ? 'bg-violet-50' : 'hover:bg-zinc-50')}>
          <button type="button" onClick={() => void openChat(c.id)} aria-current={c.id === sessionId ? 'true' : undefined} disabled={opening === c.id}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
            <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', iconTone(c.id))}><MessageCircle className="size-[18px]" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#111034]">{c.title}</span><span className="block text-xs text-zinc-500">{when(c.updated_at)}</span></span>
          </button>
          <button type="button" aria-label={`Options for ${c.title}`} aria-haspopup="menu" aria-expanded={menuFor === c.id} onClick={() => { setMenuFor(menuFor === c.id ? null : c.id); setConfirmFor(null); }}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><MoreVertical className="size-4" aria-hidden /></button>
        </div>
        {menuFor === c.id && <div role="menu" aria-label="Chat options" className="absolute right-1 top-full z-20 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_12px_36px_rgba(76,29,149,0.14)]">
          {confirmFor === c.id
            ? <div className="p-2"><p className="text-sm font-semibold text-[#111034]">Delete this chat?</p><p className="mt-0.5 text-xs text-zinc-500">It cannot be restored.</p>
                <div className="mt-2 flex gap-2"><button type="button" role="menuitem" onClick={() => void removeChat(c.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs! font-semibold! text-white hover:bg-red-700">Delete</button>
                  <button type="button" role="menuitem" onClick={() => { setConfirmFor(null); setMenuFor(null); }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs! font-semibold! text-zinc-700 hover:bg-zinc-50">Cancel</button></div></div>
            : <button type="button" role="menuitem" onClick={() => setConfirmFor(c.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm! font-semibold! text-red-700 hover:bg-red-50"><Trash2 className="size-4" aria-hidden /> Delete chat</button>}
        </div>}
      </li>)}
    </ul>
    {chatsError && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{chatsError}</p>}
    {chats && chats.length > 5 && <button type="button" onClick={() => setShowAll(a => !a)} className="mt-3 w-full text-center text-sm! font-semibold! text-violet-700 hover:underline">{showAll ? 'Show fewer chats' : <>View all chats <span aria-hidden>→</span></>}</button>}
  </>;

  return <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
    <aside aria-label="Chats" className="min-w-0 rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.05)] lg:self-start">
      <div className="flex items-center gap-3.5">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Sparkles className="size-6" /></span>
        <div className="min-w-0"><h2 className="text-lg font-bold leading-tight text-[#111034]">AI Tutor</h2><p className="text-sm text-zinc-500">Module-focused study assistant</p></div>
      </div>
      <button type="button" onClick={newChat} disabled={sending} className={cn(btnOutline, 'mt-5 w-full')}><Plus className="size-4" aria-hidden /> New Chat</button>
      <h3 className="mt-6 hidden text-base font-bold text-[#111034] lg:block">Recent</h3>
      <button type="button" aria-expanded={recentOpen} onClick={() => setRecentOpen(o => !o)} className="mt-5 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left text-base! font-bold! text-[#111034] lg:hidden">
        <span>Recent{chats && chats.length > 0 ? ` (${chats.length})` : ''}</span><ChevronDown className={cn('size-4 text-zinc-500 transition-transform', recentOpen && 'rotate-180')} aria-hidden />
      </button>
      <div className={cn('mt-3', recentOpen ? 'block' : 'hidden lg:block')}>{recentList}</div>
    </aside>

    <section aria-label="Conversation panel" className="flex min-w-0 flex-col gap-4 rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.05)] sm:p-6">
      <div className="flex justify-end"><SourcesMenu scope={scope} setScope={setScope} disabled={sending} /></div>

      <div ref={listRef} role="log" aria-live="polite" aria-label="Conversation" className="max-h-[32rem] min-h-72 space-y-5 overflow-y-auto pr-1">
        {messages.length === 0 && <div className="flex min-h-64 flex-col items-center justify-center text-center text-sm text-zinc-500">
          <span aria-hidden className="mb-3 flex size-14 items-center justify-center rounded-3xl bg-violet-50 text-violet-600"><MessageCircle className="size-7" /></span>
          <p className="font-medium text-zinc-700">Ask a question about this module.</p>
          {!hasMaterials && <p className="mt-2 max-w-sm text-xs leading-5">No indexed study material yet, so answers may be limited. Upload documents first for grounded answers.{' '}
            <button type="button" onClick={() => onOpenTool('documents')} className="font-semibold! text-violet-700 underline">Go to Documents</button></p>}
        </div>}
        {messages.map(m => m.role === 'user'
          ? <div key={m.id} className="flex items-start justify-end gap-3">
              <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-violet-100/80 px-5 py-3 text-[15px] leading-6 text-[#111034]">
                <p className="whitespace-pre-wrap break-words">{m.content}</p><p className="mt-1 text-right text-xs text-zinc-500">{clock(m.at)}</p>
              </div>
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm! font-bold! text-white">{initials || 'You'}</span>
            </div>
          : m.isError
            ? <div key={m.id} role="alert" className="max-w-[90%] rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{m.content}</div>
            : <div key={m.id} className="flex items-start gap-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600"><Sparkles className="size-5" /></span>
                <div className="min-w-0 max-w-[88%] space-y-2">
                  {m.grounded === false && <p data-testid="ungrounded-label" className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">General knowledge — not from your study materials</p>}
                  <div className={cn('rounded-2xl rounded-tl-md px-5 py-4', m.grounded === false ? 'border border-dashed border-amber-300 bg-white' : 'bg-zinc-100/80')}>
                    <MarkdownRenderer content={m.content} />
                    <div className="-mb-1 mt-2 flex items-center"><CopyAnswer text={m.content} /></div>
                  </div>
                  <p className="pl-1 text-xs text-zinc-500">{clock(m.at)}</p>
                  {m.noContent && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p>No matching study material was found for this question.</p>
                    {!!m.suggestions?.length && <ul className="mt-1 list-disc pl-4">{m.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>}
                  </div>}
                  {!!m.sources?.length && <div className="flex flex-wrap items-center gap-1.5" aria-label="Sources">
                    <span className="text-xs font-medium text-zinc-500">Sources:</span>
                    {m.sources.map(s => <span key={s.filename} title={s.snippet} data-testid="citation" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><FileText className="size-3" aria-hidden />{s.filename}</span>)}
                  </div>}
                </div>
              </div>)}
        {sending && <div className="flex items-start gap-3"><span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600"><Sparkles className="size-5" /></span>
          <div role="status" className="rounded-2xl rounded-tl-md bg-zinc-100/80 px-5 py-3 text-sm text-zinc-500">Thinking…</div></div>}
      </div>

      <div role="radiogroup" aria-label="Answer level" className="flex flex-wrap items-center justify-center gap-3">
        {LEVELS.map(l => <button key={l.value} type="button" role="radio" aria-checked={complexity === l.value} disabled={sending} onClick={() => setComplexity(l.value)}
          className={cn('inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-2xl border px-5 text-sm! font-semibold! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60',
            complexity === l.value ? 'border-violet-600 bg-violet-600 text-white shadow-sm' : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50')}>
          {complexity === l.value && <Check className="size-4" aria-hidden />}{l.label}</button>)}
      </div>

      <form className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 pl-2.5 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100" onSubmit={e => { e.preventDefault(); void send(); }}>
        <button type="button" aria-label="Add study materials" title="Add study materials (opens Documents)" onClick={() => onOpenTool('documents')}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><Paperclip className="size-5" aria-hidden /></button>
        <textarea ref={inputRef} aria-label="Ask a question" rows={1} maxLength={2000} value={input} onChange={e => { setInput(e.target.value); grow(); }} placeholder="Ask a question about this module…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 outline-none placeholder:text-zinc-400" />
        <button type="submit" aria-label="Send question" disabled={sending || !input.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><Send className="size-5" aria-hidden /></button>
      </form>
    </section>
  </div>;
}
