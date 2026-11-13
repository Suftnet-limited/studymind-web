// Controlled AI fixture shim for Web integration/browser tests. NOT live AI.
//
// Forwards everything (auth, modules, documents, entitlements) to the real local StudyMind AI backend and answers
// only the four AI generation endpoints with deterministic, clearly-marked fixtures:
//   POST /api/chat · /api/quiz/generate · /api/quiz/{id}/submit · /api/flashcards/generate · /api/summarise
// and keeps chat history in memory like the real backend does: GET /api/sessions?module_id= · GET/DELETE /api/sessions/{id}
// (only the caller's own sessions; another user's id is a 404; the detail response does NOT include module_id, as in the real API).
// Fixture responses carry `X-AI-Fixture: controlled`. Request validation mirrors the AI backend's pydantic schemas.
// Like the real backend it does NOT check module membership on these endpoints, so tests prove that Web's own
// guard is what keeps AI output scoped to modules the caller can open.
//
//   UPSTREAM=http://127.0.0.1:8000 PORT=8001 node tests/fixtures/ai-shim.mjs
//   GET /__calls -> recorded fixture calls (JSON)   DELETE /__calls -> clear
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const UPSTREAM = (process.env.UPSTREAM || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 8001);
for (const u of [UPSTREAM]) if (!['127.0.0.1', 'localhost'].includes(new URL(u).hostname)) { console.error('shim only proxies to loopback'); process.exit(2); }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const calls = [];
const attempts = new Map();   // attempt id -> { owner, questions }
const decks = new Map();      // deck id -> { owner, body }
const summaries = new Map();  // summary id -> { owner, body }
const sessions = new Map();   // session id -> { id, user_id, module_id, title, created_at, updated_at, messages[] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readBody = (req) => new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'X-AI-Fixture': 'controlled', ...extra }); res.end(JSON.stringify(body)); };
const bad = (res, detail) => send(res, 422, { detail });

const PHYSICS = [
  { q: "According to Newton's second law, what is the net force on a 5 kg mass accelerating at 3 m/s^2?", opts: ['8 N', '15 N', '1.7 N', '2 N'], correct: 'b', why: 'F = m a = 5 x 3 = 15 N.' },
  { q: "Newton's first law says an object keeps its motion unless what acts on it?", opts: ['A net external force', 'Gravity only', 'Friction only', 'Nothing'], correct: 'a', why: 'Without a net external force velocity stays constant (inertia).' },
  { q: 'Momentum is defined as:', opts: ['m / v', 'm v', 'm a', 'F t squared'], correct: 'b', why: 'p = m v.' },
  { q: 'The SI unit of force is the:', opts: ['joule', 'watt', 'newton', 'pascal'], correct: 'c', why: 'Force is measured in newtons (N).' },
  { q: 'Doubling the mass at a fixed force makes the acceleration:', opts: ['double', 'halve', 'stay the same', 'quadruple'], correct: 'b', why: 'a = F / m, so doubling m halves a.' },
];
const CARDS = [
  ["State Newton's second law.", 'The net force on an object equals its mass times its acceleration (F = m a).'],
  ['What is the SI unit of force?', 'The newton (N).'],
  ['Define momentum.', 'The product of mass and velocity, p = m v.'],
  ['What is inertia?', 'The tendency of an object to resist changes in its motion.'],
  ['What is work done by a force?', 'Force multiplied by distance moved in the direction of the force, W = F d.'],
  ["What does Newton's third law say?", 'Every action force has an equal and opposite reaction force on a different body.'],
];
const MATH_QUIZ = [
  { q: String.raw`What is $\frac{2}{5}+\frac{3}{10}$?`, opts: [String.raw`$\frac{5}{15}$`, String.raw`$\frac{7}{10}$`, String.raw`\(\frac{1}{2}\)`, String.raw`$\frac{6}{50}$`], correct: 'b', why: String.raw`Convert to tenths: $\frac{4}{10}+\frac{3}{10}=\frac{7}{10}$.` },
  { q: String.raw`Solve $x^2=144$ for positive $x$.`, opts: ['10', '11', '12', '14'], correct: 'c', why: String.raw`$\sqrt{144}=12$.` },
  { q: 'Which is the balanced equation for water?', opts: ['H₂ + O₂ → H₂O', '2H₂ + O₂ → 2H₂O', 'H + O → HO', '2H + 2O → H₂O₂'], correct: 'b', why: 'Two hydrogen molecules react with one oxygen molecule: 2H₂ + O₂ → 2H₂O.' },
  { q: 'In *Romeo and Juliet*, which family does Juliet belong to?', opts: ['Montague', 'Capulet', 'Tybalt', 'Escalus'], correct: 'b', why: 'Juliet is a **Capulet**.' },
  { q: String.raw`Avogadro's number is $6.02\times10^{23}$. What does it count?`, opts: ['Atoms in a mole', 'Grams in a kilogram', 'Metres in a mile', 'Seconds in a day'], correct: 'a', why: String.raw`One mole holds $6.02\times10^{23}$ particles.` },
];
const MATH_CARDS = [
  [String.raw`Add $\frac{1}{4}+\frac{1}{2}$`, String.raw`$\frac{3}{4}$`], [String.raw`Area of a circle`, String.raw`$A=\pi r^2$`], ['Formula for water', 'H₂O'],
  [String.raw`Quadratic formula`, String.raw`$$x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$`], ['Who wrote *Hamlet*?', 'William **Shakespeare**'],
];

async function identity(auth) {
  const r = await fetch(`${UPSTREAM}/api/auth/me`, { headers: { Authorization: auth } }).catch(() => null);
  if (!r || !r.ok) return null;
  const me = await r.json().catch(() => null);
  return me?.id ? { id: me.id, role: me.role } : null;
}


// Rich educational content for the shared renderer tests: maths in every delimiter style (including damaged ones an older lesson may hold),
// chemistry, tables, code, ordinary prose that must stay prose, malformed maths, and hostile markup that must never become elements.
// Triggered by "MATHSAMPLE" in a chat message or a topic.
export const MATH_SAMPLE = String.raw`## Year 5: adding fractions

Inline: $\frac{2}{5}+\frac{3}{10}=\frac{7}{10}$ and older style \(\frac{1}{2}+\frac{1}{4}=\frac{3}{4}\).

Display:

$$\int_0^1 x^2\,dx=\frac{1}{3}$$

\[ax^2+bx+c=0\]

Powers $x^2+y^2=z^2$, roots $\sqrt{144}=12$ and $6.02\times10^{23}$ molecules. Double-encoded: \\(\\frac{9}{10}\\). Damaged by JSON: $` + '\f' + String.raw`rac{3}{4}$.

### Science
- Water is H₂O, carbon dioxide is CO₂, sulfuric acid H₂SO₄, sulfate SO₄²⁻, sodium Na⁺.
- 2H₂ + O₂ → 2H₂O and N₂ + 3H₂ ⇌ 2NH₃, at 25 °C with ΔT = 5 and λ = 500 nm, R = 8 Ω, μ = 0.3.
- $\ce{2H2 + O2 -> 2H2O}$ and F = ma, E = mc², v = u + at, π ≈ 3.14, x ≤ y, a ∈ A, ∑, ∫, ∂, ∞.
- Area is 5 m<sup>2</sup>.

| Shape | Sides | Area formula |
|-------|-------|--------------|
| Square | 4 | $s^2$ |
| Triangle | 3 | $\tfrac{1}{2}bh$ |

> Remember: the denominator tells you how many equal parts make a whole.

1. Find a common denominator.
2. Convert each fraction.
3. Add the numerators.

~~~python
def add(a, b):
    return a + b   # costs $5 and \(x\) stay as written
~~~

It was the best of times, it was the worst of times. The book costs $5 and the pen $10 (see **Chapter 2**: "Prices").

Malformed: $\frac{1$ and \(\notacommand{x}\) and $$\begin{$$

<script>window.__xss = 1</script> <img src=x onerror="window.__xss = 2">

[bad link](javascript:window.__xss=3) [good link](https://example.com/page)`;

function chatAnswer(message) {
  const m = message.toLowerCase();
  if (m.includes('mathsample')) return { answer: MATH_SAMPLE, sources: [{ document_id: randomUUID(), filename: 'year5-maths.docx', chunk_index: 0, content_snippet: 'Adding fractions', relevance_score: 0.9 }] };
  if (m.includes('trigger_empty')) return { answer: "I couldn't find anything about that in your module materials.", sources: [], no_content_found: true, suggestions: ['Upload a document that covers this topic', 'Rephrase your question'] };
  if (m.includes('newton') || m.includes('force')) return { answer: "**Newton's second law** says the net force on an object equals its mass times its acceleration:\n\n- F = m a\n- Force is measured in newtons (N)\n\nFor a 5 kg mass accelerating at 3 m/s^2 the force is `15 N`.",
    sources: [{ document_id: randomUUID(), filename: 'physics-notes.pdf', chunk_index: 0, content_snippet: 'Newton\'s second law states that the net force acting on an object equals its mass multiplied by its acceleration.', relevance_score: 0.93 },
      { document_id: randomUUID(), filename: 'physics-notes.pdf', chunk_index: 1, content_snippet: 'Worked example: 5 kg at 3 m/s^2 gives 15 N.', relevance_score: 0.8 }] };
  if (m.includes('base pair') || m.includes('dna')) return { answer: 'Adenine pairs with thymine and guanine pairs with cytosine, held by hydrogen bonds.',
    sources: [{ document_id: randomUUID(), filename: 'biology-notes.docx', chunk_index: 0, content_snippet: 'Complementary base pairing means adenine always pairs with thymine.', relevance_score: 0.9 }] };
  return { answer: 'This is a controlled fixture answer.', sources: [{ document_id: randomUUID(), filename: 'fixture-notes.txt', chunk_index: 0, content_snippet: 'fixture snippet', relevance_score: 0.5 }] };
}

async function fixture(req, res, path, body) {
  const auth = req.headers.authorization || '';
  const me = await identity(auth);
  if (!me) return send(res, 401, { detail: 'Could not validate credentials' });
  let data; try { data = JSON.parse(body.toString() || '{}'); } catch { return bad(res, 'Invalid JSON'); }
  calls.push({ path, user_id: me.id, role: me.role, has_bearer: auth.startsWith('Bearer '), body: data, at: Date.now() });
  const needModule = () => !(typeof data.module_id === 'string' && UUID.test(data.module_id));
  const uuidOpt = (v) => v === undefined || v === null || (typeof v === 'string' && UUID.test(v));
  const topic = typeof data.topic === 'string' ? data.topic : '';
  if (topic.length > 200) return bad(res, 'topic too long');
  if (topic.includes('TRIGGER_ERROR')) return send(res, 500, { detail: 'Incorrect API key provided: sk-fixture-leak. Traceback (most recent call last): File "app/agents/x.py"' });
  if (topic.includes('TRIGGER_EMPTY')) return bad(res, 'No indexed content found for this module');

  if (path === '/api/chat') {
    if (typeof data.message !== 'string' || !data.message.length || data.message.length > 8192) return bad(res, 'message length must be 1..8192');
    if (!['simple', 'normal', 'expert'].includes(data.complexity ?? 'normal')) return bad(res, 'complexity invalid');
    if (!['everything', 'class_only', 'personal_only', 'all_semesters'].includes(data.scope_mode ?? 'everything')) return bad(res, 'scope_mode invalid');
    if (data.module_id !== undefined && needModule()) return bad(res, 'module_id invalid');
    if (!uuidOpt(data.session_id)) return bad(res, 'session_id invalid');
    const m = data.message.toLowerCase();
    if (m.includes('trigger_error')) return send(res, 500, { detail: 'Incorrect API key provided: sk-fixture-leak. Traceback (most recent call last): File "app/agents/x.py"' });
    if (m.includes('trigger_429')) return send(res, 429, { detail: 'AI usage allowance exhausted' });
    if (m.includes('trigger_slow')) await sleep(1500);
    const a = chatAnswer(data.message);
    let sess = data.session_id ? sessions.get(data.session_id) : null;
    if (sess && sess.user_id !== me.id) return send(res, 404, { detail: 'Session not found' });          // like the backend: someone else's chat id is a 404
    const now = new Date().toISOString();
    if (!sess) { sess = { id: data.session_id || randomUUID(), user_id: me.id, module_id: data.module_id ?? null, title: data.message.length > 60 ? `${data.message.slice(0, 60)}…` : data.message, created_at: now, updated_at: now, messages: [] }; sessions.set(sess.id, sess); }
    const botId = randomUUID();
    sess.messages.push({ id: randomUUID(), role: 'user', content: data.message, created_at: now, sources: null, latency_ms: null });
    sess.messages.push({ id: botId, role: 'assistant', content: a.answer, created_at: new Date().toISOString(), sources: a.sources, latency_ms: 12 });
    sess.updated_at = new Date().toISOString();
    return send(res, 200, { message_id: botId, session_id: sess.id, answer: a.answer, sources: a.sources, latency_ms: 12, token_count: 99,
      scope: { description: `Module ${String(data.module_id).slice(0, 8)} · ${data.scope_mode ?? 'everything'}`, module_id: data.module_id, scope_mode: data.scope_mode ?? 'everything', document_count: a.sources.length },
      no_content_found: !!a.no_content_found, suggestions: a.suggestions ?? [] });
  }
  if (path === '/api/quiz/generate') {
    if (![data.module_id, data.week_id, data.document_id].some(Boolean) || needModule()) return bad(res, 'module_id required');
    if (!Number.isInteger(data.question_count ?? 10) || (data.question_count ?? 10) < 5 || (data.question_count ?? 10) > 30) return bad(res, 'question_count must be 5..30');
    if (!['mcq', 'short_answer', 'true_false'].includes(data.question_type ?? 'mcq')) return bad(res, 'question_type invalid');
    if (topic.includes('TRIGGER_SLOW')) await sleep(1500);
    const n = Math.min(data.question_count ?? 5, PHYSICS.length);
    const id = randomUUID(); const bank = topic.includes('MATHSAMPLE') ? MATH_QUIZ : PHYSICS; const questions = bank.slice(0, n).map((q, i) => ({ id: randomUUID(), position: i + 1, question: q.q, options: q.opts.map((t, j) => ({ id: 'abcd'[j], text: t })), correct_answer: q.correct, explanation: q.why, source_chunk: 'physics-notes.pdf', student_answer: null, is_correct: null }));
    const created = { id, module_id: data.module_id, title: topic ? `Quiz: ${topic}` : 'Quiz', question_type: 'mcq', question_count: n, status: 'generated', created_at: new Date().toISOString(), score: null, submitted_at: null };
    attempts.set(id, { owner: me.id, questions, head: created });
    return send(res, 201, { ...created, questions });
  }
  const submit = path.match(/^\/api\/quiz\/([0-9a-f-]{36})\/submit$/i);
  if (submit) {
    const attempt = attempts.get(submit[1]);
    if (!attempt || attempt.owner !== me.id) return send(res, 404, { detail: 'Quiz not found' });   // like _get_quiz_or_404(attempt, user)
    if (!Array.isArray(data.answers) || !data.answers.length || data.answers.some((a) => !UUID.test(a?.question_id) || typeof a?.answer !== 'string' || !a.answer)) return bad(res, 'answers invalid');
    const map = new Map(data.answers.map((a) => [a.question_id, a.answer]));
    const questions = attempt.questions.map((q) => { const given = (map.get(q.id) || ''); return { ...q, student_answer: given, is_correct: !!given.trim() && given.trim().toLowerCase() === q.correct_answer }; });
    const correct = questions.filter((q) => q.is_correct).length;
    attempt.questions = questions; attempt.head = { ...attempt.head, status: 'submitted', score: Math.round((correct / questions.length) * 1000) / 10, submitted_at: new Date().toISOString() };
    return send(res, 200, { attempt_id: submit[1], score: Math.round((correct / questions.length) * 1000) / 10, total: questions.length, correct, questions });
  }
  if (path === '/api/flashcards/generate') {
    if (![data.module_id, data.week_id, data.document_id].some(Boolean) || needModule()) return bad(res, 'module_id required');
    if (!Number.isInteger(data.max_cards ?? 20) || (data.max_cards ?? 20) < 5 || (data.max_cards ?? 20) > 50) return bad(res, 'max_cards must be 5..50');
    const cards = (topic.includes('MATHSAMPLE') ? MATH_CARDS : CARDS).slice(0, Math.min(data.max_cards ?? 20, CARDS.length)).map(([front, back], i) => ({ id: randomUUID(), position: i + 1, front, back, source_chunk: 'physics-notes.pdf', status: 'new' }));
    const deck = { id: randomUUID(), module_id: data.module_id, title: data.title || 'Flashcards', card_count: cards.length, mastered_count: 0, created_at: new Date().toISOString(), last_studied_at: null, cards };
    decks.set(deck.id, { owner: me.id, body: deck });
    return send(res, 201, deck);
  }
  if (path === '/api/summarise') {
    if (![data.module_id, data.week_id, data.document_id].some(Boolean) || needModule()) return bad(res, 'module_id required');
    if (!['document', 'week', 'module'].includes(data.scope ?? 'document')) return bad(res, 'scope invalid');
    if (topic.includes('TRIGGER_SLOW')) await sleep(1500);
    const summary = { id: randomUUID(), module_id: data.module_id, scope: data.scope ?? 'document', source_doc_count: 2, created_at: new Date().toISOString(),
      content: topic.includes('MATHSAMPLE') ? MATH_SAMPLE : `## Summary${topic ? `: ${topic}` : ''}\n\n- **Newton's laws** relate force, mass and acceleration (F = m a).\n- Momentum is conserved in a closed system.\n\n1. Define the quantities\n2. Apply the laws${topic.includes('TRIGGER_ADVICE') ? '\n\n## General study advice (not from your documents)\n- Use spaced repetition.\n- Test yourself regularly.' : ''}` };
    summaries.set(summary.id, { owner: me.id, body: summary });
    return send(res, 201, summary);
  }
  return send(res, 404, { detail: 'not a fixture route' });
}

async function sessionsApi(req, res, path, url) {
  const me = await identity(req.headers.authorization || '');
  if (!me) return send(res, 401, { detail: 'Could not validate credentials' });
  const m = path.match(/^\/api\/sessions(?:\/([0-9a-f-]{36}))?$/i);
  const row = (x) => ({ id: x.id, title: x.title, module_id: x.module_id, created_at: x.created_at, updated_at: x.updated_at, is_active: true, message_count: x.messages.length });
  if (!m[1]) {
    if (req.method !== 'GET') return send(res, 405, { detail: 'Method Not Allowed' });
    const moduleId = url.searchParams.get('module_id');
    const mine = [...sessions.values()].filter((x) => x.user_id === me.id && (!moduleId || x.module_id === moduleId)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 50);
    return send(res, 200, mine.map(row));
  }
  const sess = sessions.get(m[1]);
  if (!sess || sess.user_id !== me.id) return send(res, 404, { detail: 'Session not found' });
  if (req.method === 'GET') { const { module_id, ...rest } = row(sess); return send(res, 200, { ...rest, messages: sess.messages }); }
  if (req.method === 'DELETE') { sessions.delete(sess.id); res.writeHead(204, { 'X-AI-Fixture': 'controlled' }); return res.end(); }
  return send(res, 405, { detail: 'Method Not Allowed' });
}

// Saved quizzes, flashcard sets and summaries: the caller's own only, like the real backend. Quiz detail returns the full attempt (the Web layer withholds answers until submitted).
async function historyApi(req, res, path, url) {
  const me = await identity(req.headers.authorization || '');
  if (!me) return send(res, 401, { detail: 'Could not validate credentials' });
  const moduleId = url.searchParams.get('module_id');
  const stores = { quiz: attempts, flashcards: decks, summarise: summaries };
  const list = path.match(/^\/api\/(flashcards|summarise)$/i) || path.match(/^\/api\/(quiz)\/history\/list$/i);
  if (list) {
    const kind = list[1].toLowerCase(); if (req.method !== 'GET') return send(res, 405, { detail: 'Method Not Allowed' });
    const rows = [...stores[kind].values()].filter((x) => x.owner === me.id).map((x) => (kind === 'quiz' ? { ...x.head, answered_count: x.questions.filter((q) => q.student_answer).length } : x.body)).filter((x) => !moduleId || x.module_id === moduleId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
    return send(res, 200, rows);
  }
  const one = path.match(/^\/api\/(quiz|flashcards|summarise)\/([0-9a-f-]{36})$/i);
  const kind = one[1].toLowerCase(); const rec = stores[kind].get(one[2]);
  if (!rec || rec.owner !== me.id) return send(res, 404, { detail: 'Not found' });
  if (req.method === 'DELETE') { stores[kind].delete(one[2]); res.writeHead(204, { 'X-AI-Fixture': 'controlled' }); return res.end(); }
  return send(res, 200, kind === 'quiz' ? { ...rec.head, questions: rec.questions } : rec.body);
}

const FIXTURE = /^\/api\/(chat|quiz\/generate|quiz\/[0-9a-f-]{36}\/submit|flashcards\/generate|summarise)$/i;
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const path = url.pathname;
  try {
    if (path === '/__calls') { if (req.method === 'DELETE') { calls.length = 0; return send(res, 200, { cleared: true }); } return send(res, 200, calls); }
    const body = await readBody(req);
    if (req.method === 'POST' && FIXTURE.test(path)) return await fixture(req, res, path, body);
    if (/^\/api\/sessions(\/[0-9a-f-]{36})?$/i.test(path) && ['GET', 'DELETE'].includes(req.method)) return await sessionsApi(req, res, path, url);
    if (['GET', 'DELETE'].includes(req.method) && (/^\/api\/(flashcards|summarise)$/i.test(path) || /^\/api\/quiz\/history\/list$/i.test(path) || /^\/api\/(quiz|flashcards|summarise)\/[0-9a-f-]{36}$/i.test(path))) return await historyApi(req, res, path, url);
    // Everything else goes to the real backend unchanged.
    const headers = { ...req.headers }; delete headers.host; delete headers['content-length']; delete headers.connection;
    const up = await fetch(UPSTREAM + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, redirect: 'manual' });
    const out = Buffer.from(await up.arrayBuffer());
    const outHeaders = {}; up.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) outHeaders[k] = v; });
    res.writeHead(up.status, outHeaders); res.end(out);
  } catch (e) { send(res, 502, { detail: `shim error: ${e.message}` }); }
}).listen(PORT, '127.0.0.1', () => console.log(`ai-shim on 127.0.0.1:${PORT} -> ${UPSTREAM}`));
