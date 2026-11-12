// Pure, dependency-free helpers for the canonical AI learning proxy (chat, quiz, flashcards, summary).
// Adapted from the request/response handling in studymind-react (src/api.ts) but targeting the canonical,
// JWT-authenticated StudyMind AI endpoints instead of the platform /api/v1 API-key endpoints.
// Input is validated and whitelisted here; the module id always comes from the URL, never from the browser.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

export const COMPLEXITIES = ['simple', 'normal', 'expert'];
// The chat sources selector. `all_semesters` and `include_archived` are deliberately not exposed to the browser.
export const SCOPES = ['everything', 'class_only', 'personal_only'];
export const LIMITS = { message: 2000, topic: 200, answer: 500, quizQuestions: [5, 20], flashcards: [5, 50] };

export function parseTopic(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false, error: 'Topic must be text' };
  const topic = value.trim();
  if (topic.length > LIMITS.topic) return { ok: false, error: `Topic must be at most ${LIMITS.topic} characters` };
  return { ok: true, value: topic || undefined };
}
// Chapters the learner picked in the topic list. Each is "document_id:index" from the module outline; the AI backend checks every one
// against what this user can see in this module, so the browser can only narrow what is used, never reach other material.
export const SECTION_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d{1,4}$/i;
export const MAX_SECTIONS = 12;
/** Optional chapter focus: { sections?, balanced?, label? } with only the keys that were actually sent. */
export function parseFocus(input) {
  const out = {};
  if (input.sections !== undefined && input.sections !== null) {
    if (!Array.isArray(input.sections) || input.sections.length > MAX_SECTIONS || !input.sections.every((r) => typeof r === 'string' && SECTION_REF.test(r)))
      return { ok: false, error: `Choose up to ${MAX_SECTIONS} chapters` };
    const refs = [...new Set(input.sections.map((r) => r.toLowerCase()))];
    if (refs.length) out.sections = refs;
  }
  if (input.balanced !== undefined && typeof input.balanced !== 'boolean') return { ok: false, error: 'Invalid request' };
  if (input.balanced === true && !out.sections) out.balanced = true;
  if (typeof input.label === 'string' && input.label.trim()) out.label = input.label.trim().slice(0, 120);
  return { ok: true, value: out };
}
function intInRange(value, [min, max], fallback, label) {
  if (value === undefined || value === null) return { ok: true, value: fallback };
  if (!Number.isInteger(value) || value < min || value > max) return { ok: false, error: `${label} must be between ${min} and ${max}` };
  return { ok: true, value };
}

export function parseChatInput(body) {
  if (!isObject(body)) return { ok: false, error: 'Invalid request' };
  const message = str(body.message)?.trim() ?? '';
  if (!message) return { ok: false, error: 'Enter a question' };
  if (message.length > LIMITS.message) return { ok: false, error: `Questions can be at most ${LIMITS.message} characters` };
  if (body.session_id !== undefined && body.session_id !== null && !(typeof body.session_id === 'string' && UUID.test(body.session_id)))
    return { ok: false, error: 'Invalid session' };
  const complexity = body.complexity ?? 'normal';
  if (!COMPLEXITIES.includes(complexity)) return { ok: false, error: 'Invalid complexity' };
  const scope_mode = body.scope_mode ?? 'everything';
  if (!SCOPES.includes(scope_mode)) return { ok: false, error: 'Invalid source selection' };
  return { ok: true, value: { message, session_id: body.session_id ?? undefined, complexity, scope_mode } };
}
export function parseQuizInput(body) {
  if (body !== undefined && body !== null && !isObject(body)) return { ok: false, error: 'Invalid request' };
  const input = body ?? {};
  const topic = parseTopic(input.topic); if (!topic.ok) return topic;
  const count = intInRange(input.question_count, LIMITS.quizQuestions, 5, 'Question count'); if (!count.ok) return count;
  const focus = parseFocus(input); if (!focus.ok) return focus;
  return { ok: true, value: { topic: topic.value, question_count: count.value, ...focus.value } };
}
export function parseFlashcardInput(body) {
  if (body !== undefined && body !== null && !isObject(body)) return { ok: false, error: 'Invalid request' };
  const input = body ?? {};
  const topic = parseTopic(input.topic); if (!topic.ok) return topic;
  const count = intInRange(input.max_cards, LIMITS.flashcards, 20, 'Card count'); if (!count.ok) return count;
  const focus = parseFocus(input); if (!focus.ok) return focus;
  return { ok: true, value: { topic: topic.value, max_cards: count.value, ...focus.value } };
}
export function parseSummaryInput(body) {
  if (body !== undefined && body !== null && !isObject(body)) return { ok: false, error: 'Invalid request' };
  const topic = parseTopic((body ?? {}).topic); if (!topic.ok) return topic;
  const focus = parseFocus(body ?? {}); if (!focus.ok) return focus;
  return { ok: true, value: { topic: topic.value, ...focus.value } };
}
export function parseQuizSubmit(body) {
  if (!isObject(body) || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 30) return { ok: false, error: 'Answer at least one question' };
  const answers = [];
  for (const a of body.answers) {
    if (!isObject(a) || typeof a.question_id !== 'string' || !UUID.test(a.question_id) || typeof a.answer !== 'string' || !a.answer.trim() || a.answer.length > LIMITS.answer)
      return { ok: false, error: 'Invalid answer' };
    answers.push({ question_id: a.question_id.toLowerCase(), answer: a.answer });
  }
  if (new Set(answers.map((a) => a.question_id)).size !== answers.length) return { ok: false, error: 'Each question can be answered once' };
  return { ok: true, value: { answers } };
}

// ── Requests to the AI backend: module_id is ALWAYS the validated URL id; nothing user-identifying comes from the browser ──
export const toChatRequest = (moduleId, v) => ({ module_id: moduleId, message: v.message, complexity: v.complexity, scope_mode: v.scope_mode ?? 'everything', ...(v.session_id ? { session_id: v.session_id } : {}) });
const toFocus = (v) => ({ ...(v.sections?.length ? { sections: v.sections } : {}), ...(v.balanced ? { balanced: true } : {}) });
export const toQuizRequest = (moduleId, v) => ({ module_id: moduleId, question_count: v.question_count, question_type: 'mcq', ...(v.topic ? { topic: v.topic } : {}), ...toFocus(v), ...(v.sections?.length && v.label ? { title: `Quiz: ${v.label}`.slice(0, 255) } : {}) });
export const toFlashcardRequest = (moduleId, v) => ({ module_id: moduleId, max_cards: v.max_cards, ...(v.topic ? { title: `Flashcards: ${v.topic}`.slice(0, 255), topic: v.topic } : {}), ...toFocus(v), ...(v.sections?.length && v.label ? { title: `Flashcards: ${v.label}`.slice(0, 255) } : {}) });
export const toSummaryRequest = (moduleId, v) => ({ module_id: moduleId, scope: 'module', ...(v.topic ? { topic: v.topic } : {}), ...toFocus(v) });

// ── Responses: whitelist fields; never forward unknown/internal data ──
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
export function mapChat(raw) {
  if (!isObject(raw) || typeof raw.answer !== 'string') return null;
  const seen = new Map();
  for (const s of Array.isArray(raw.sources) ? raw.sources : []) {
    if (!isObject(s) || typeof s.filename !== 'string' || seen.has(s.filename)) continue;
    seen.set(s.filename, { filename: text(s.filename, 255), snippet: text(s.content_snippet, 300), document_id: text(s.document_id, 64) });
  }
  // "Grounded" means the backend retrieved study material for this answer. An ungrounded answer is general knowledge:
  // it is labelled as such and NEVER carries citations, whatever the upstream payload contained.
  const noContent = raw.no_content_found === true;
  const sources = noContent ? [] : [...seen.values()].slice(0, 8);
  return {
    answer: raw.answer.slice(0, 20000),
    session_id: typeof raw.session_id === 'string' ? raw.session_id : null,
    message_id: typeof raw.message_id === 'string' ? raw.message_id : null,
    sources,
    grounded: !noContent && sources.length > 0,
    no_content_found: noContent,
    suggestions: (Array.isArray(raw.suggestions) ? raw.suggestions : []).filter((s) => typeof s === 'string').slice(0, 4).map((s) => s.slice(0, 200)),
    scope: isObject(raw.scope) ? text(raw.scope.description, 200) : '',
  };
}
const mapOptions = (o) => (Array.isArray(o) ? o.filter((x) => isObject(x) && typeof x.id === 'string' && typeof x.text === 'string').map((x) => ({ id: text(x.id, 64), text: text(x.text, 500) })) : []);
/** Generated quiz: correct answers and explanations are withheld until the quiz is submitted. */
export function mapQuizGenerated(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.questions)) return null;
  return {
    attempt_id: raw.id, title: text(raw.title, 255),
    questions: raw.questions.filter(isObject).map((q) => ({ id: text(q.id, 64), position: Number(q.position) || 0, question: text(q.question, 2000), options: mapOptions(q.options) }))
      .sort((a, b) => a.position - b.position),
  };
}
export function mapQuizResult(raw) {
  if (!isObject(raw) || !Array.isArray(raw.questions)) return null;
  return {
    attempt_id: text(raw.attempt_id, 64), score: Number(raw.score) || 0, total: Number(raw.total) || 0, correct: Number(raw.correct) || 0,
    questions: raw.questions.filter(isObject).map((q) => ({
      id: text(q.id, 64), position: Number(q.position) || 0, question: text(q.question, 2000), options: mapOptions(q.options),
      correct_answer: text(q.correct_answer, 500), explanation: text(q.explanation, 2000), student_answer: typeof q.student_answer === 'string' ? q.student_answer : null,
      is_correct: q.is_correct === true,
    })).sort((a, b) => a.position - b.position),
  };
}
export function mapFlashcards(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.cards)) return null;
  return {
    deck_id: raw.id, title: text(raw.title, 255),
    cards: raw.cards.filter((c) => isObject(c) && typeof c.front === 'string' && typeof c.back === 'string')
      .map((c) => ({ id: text(c.id, 64), position: Number(c.position) || 0, front: text(c.front, 1000), back: text(c.back, 2000) })).sort((a, b) => a.position - b.position),
  };
}
// Everything from this heading on is generic study advice, not a summary of the documents (older backends called it "Exam Tips").
const ADVICE_HEADING = /^#{1,4}[ \t]*(general study advice|exam tips)\b[^\n]*$/im;
/** Splits a summary into document-grounded content and optional general study advice. */
export function splitSummary(content) {
  const m = ADVICE_HEADING.exec(content);
  if (!m) return { content: content.trim(), advice: null };
  const advice = content.slice(m.index + m[0].length).trim();
  return { content: content.slice(0, m.index).trim(), advice: advice || null };
}
export function mapSummary(raw) {
  if (!isObject(raw) || typeof raw.content !== 'string' || !raw.content.trim()) return null;
  const { content, advice } = splitSummary(raw.content.slice(0, 40000));
  if (!content) return null;
  return { id: text(raw.id, 64), content, advice, source_doc_count: Number(raw.source_doc_count) || 0, created_at: typeof raw.created_at === 'string' ? raw.created_at : null };
}

/** Maps an AI backend failure to a safe status + message. Upstream bodies and exception text are never forwarded for 5xx. */
export function aiFailure(status, data) {
  const detail = isObject(data) && typeof data.detail === 'string' ? data.detail.slice(0, 300) : '';
  if (status === 401) return { status: 401, error: 'Authentication required' };
  if (status === 403) return { status: 403, error: "You do not have access to this module's study tools." };
  if (status === 404) return { status: 404, error: 'This module could not be found.' };
  // Only actionable messages pass through ("No content found ... Upload materials first"); internal ones
  // (e.g. "LLM returned invalid JSON: ...") are replaced by a generic message.
  if (status === 422) return { status: 422, error: /\b(no|not enough) (indexed )?(content|documents?|material)/i.test(detail) ? detail : 'The AI could not produce a usable result for this request. Please try again, or check that the module has indexed study material.' };
  if (status === 429 || status === 402) return { status: 429, error: 'You have used your AI allowance for now. Check Plans for details.' };
  return { status: 502, error: 'The AI service is unavailable right now. Please try again in a moment.' };
}


// ── Chat history (the caller's own sessions only; the backend enforces ownership, Web enforces module scope) ──
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
export const sessionIds = (raw) => (Array.isArray(raw) ? raw : []).filter((s) => isObject(s) && typeof s.id === 'string' && UUID.test(s.id)).map((s) => s.id.toLowerCase());
export function mapSessionList(raw) {
  return (Array.isArray(raw) ? raw : []).filter((s) => isObject(s) && typeof s.id === 'string' && UUID.test(s.id)).slice(0, 50).map((s) => ({
    id: s.id.toLowerCase(), title: text(s.title, 120) || 'New conversation', updated_at: iso(s.updated_at) ?? iso(s.created_at),
    message_count: Number.isInteger(s.message_count) && s.message_count >= 0 ? s.message_count : 0,
  }));
}
export function mapSessionDetail(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages.filter((m) => isObject(m) && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(0, 200).map((m) => {
    const seen = new Map();
    for (const c of Array.isArray(m.sources) ? m.sources : []) {
      if (!isObject(c) || typeof c.filename !== 'string' || seen.has(c.filename)) continue;
      seen.set(c.filename, { filename: text(c.filename, 255), snippet: text(c.content_snippet, 300), document_id: text(c.document_id, 64) });
    }
    return { id: typeof m.id === 'string' ? m.id : '', role: m.role, content: m.content.slice(0, 20000), created_at: iso(m.created_at), sources: m.role === 'assistant' ? [...seen.values()].slice(0, 8) : [] };
  });
  return { id: raw.id.toLowerCase(), title: text(raw.title, 120) || 'New conversation', messages };
}


// ── Study-tool history: the caller's own saved quizzes, flashcard sets and summaries ──
export const HISTORY_KINDS = ['quiz', 'flashcards', 'summary'];
const plain = (s) => String(s ?? '').replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function historyRow(kind, r) {
  if (!isObject(r) || typeof r.id !== 'string' || !UUID.test(r.id)) return null;
  const id = r.id.toLowerCase(); const created_at = iso(r.created_at);
  if (kind === 'quiz') {
    const submitted = r.status === 'submitted'; const n = Number.isInteger(r.question_count) ? r.question_count : 0;
    const answered = Number.isInteger(r.answered_count) ? r.answered_count : 0;
    return { id, title: plain(r.title).slice(0, 100) || 'Quiz', created_at, detail: submitted ? `${plural(n, 'question', 'questions')} · Score ${Math.round(Number(r.score) || 0)}%` : `${plural(n, 'question', 'questions')} · ${answered} answered`, completed: submitted };
  }
  if (kind === 'flashcards') {
    const n = Number.isInteger(r.card_count) ? r.card_count : Array.isArray(r.cards) ? r.cards.length : 0;
    return { id, title: plain(r.title).slice(0, 100) || 'Flashcards', created_at, detail: plural(n, 'card', 'cards'), completed: false };
  }
  if (typeof r.content !== 'string') return null;
  const first = r.content.split('\n').map(plain).find(Boolean) ?? '';
  const docs = Number(r.source_doc_count) || 0;
  return { id, title: first.slice(0, 80) || 'Summary', created_at, detail: docs > 0 ? plural(docs, 'document', 'documents') : 'Module summary', completed: false };
}
/** Newest first, at most 50, with only display fields (never questions, answers or content). */
export const mapHistoryList = (kind, raw) => (Array.isArray(raw) ? raw : []).map((r) => historyRow(kind, r)).filter(Boolean)
  .sort((a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0)).slice(0, 50);
/** An opened quiz. Correct answers and explanations are included ONLY once the quiz has been submitted. */
export function mapQuizDetail(raw) {
  const quiz = mapQuizGenerated(raw); if (!quiz) return null;
  const answers = {};
  for (const q of raw.questions) if (isObject(q) && typeof q.id === 'string' && typeof q.student_answer === 'string') answers[q.id] = q.student_answer.slice(0, LIMITS.answer);
  const created_at = iso(raw.created_at);
  if (raw.status !== 'submitted') return { kind: 'quiz', status: 'in_progress', created_at, quiz, answers, result: null };
  const qs = raw.questions.filter(isObject);
  const result = mapQuizResult({ attempt_id: raw.id, score: raw.score, total: qs.length, correct: qs.filter((q) => q.is_correct === true).length, questions: qs });
  return result ? { kind: 'quiz', status: 'submitted', created_at, quiz, answers, result } : null;
}
export const mapFlashcardDetail = (raw) => { const d = mapFlashcards(raw); return d ? { kind: 'flashcards', created_at: iso(raw.created_at), deck: d } : null; };
export const mapSummaryDetail = (raw) => { const s = mapSummary(raw); return s ? { kind: 'summary', created_at: s.created_at, summary: s } : null; };


// ── Topic suggestions: the module's weeks (chapters) and its indexed documents, offered next to the free-text topic ──
const cleanTitle = (v) => text(typeof v === 'string' ? v : '', 200).replace(/\s+/g, ' ').trim();
const stripExtension = (name) => name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
/** Titles only: no ids, owners or file details. Each value is what is sent as the topic. */
export function mapOutline(weeksRaw, docsRaw, structureRaw) {
  const seen = new Set(); const take = (label, value) => { const key = value.toLowerCase(); if (!value || seen.has(key)) return null; seen.add(key); return { label, value }; };
  const weeks = (Array.isArray(weeksRaw) ? weeksRaw : []).filter(isObject).sort((a, b) => (Number(a.week_number) || 0) - (Number(b.week_number) || 0)).slice(0, 60)
    .map((w) => { const title = cleanTitle(w.title); return title ? take(Number.isInteger(w.week_number) ? `Week ${w.week_number}: ${title}` : title, title) : null; }).filter(Boolean);
  const documents = (Array.isArray(docsRaw) ? docsRaw : []).filter((d) => isObject(d) && d.is_latest !== false && (String(d.status ?? '').toLowerCase() === 'indexed' || Number(d.chunk_count) > 0))
    .slice(0, 100).map((d) => { const title = stripExtension(cleanTitle(d.filename ?? d.original_filename)); return title ? take(title, title) : null; }).filter(Boolean);
  return { weeks, documents, chapters: mapChapters(structureRaw) };
}
/** Chapters and sections detected at upload, per document. `ref` is what a generation request sends back. */
function mapChapters(raw) {
  const docs = isObject(raw) && Array.isArray(raw.documents) ? raw.documents : [];
  return docs.filter(isObject).slice(0, 30).map((d) => {
    const sections = (Array.isArray(d.sections) ? d.sections : []).filter(isObject).slice(0, 200).map((x) => {
      const title = cleanTitle(x.title); const ref = typeof x.ref === 'string' ? x.ref.toLowerCase() : '';
      return title && SECTION_REF.test(ref) ? { ref, title, level: Math.min(Math.max(Number(x.level) || 1, 1), 3), page: Number.isInteger(x.page) && x.page > 0 ? x.page : null } : null;
    }).filter(Boolean);
    return { document: stripExtension(cleanTitle(d.filename)) || 'Document', sections };
  }).filter((d) => d.sections.length > 0);
}
