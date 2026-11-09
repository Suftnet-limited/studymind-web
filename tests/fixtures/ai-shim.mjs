// Controlled AI fixture shim for Web integration/browser tests. NOT live AI.
//
// Forwards everything (auth, modules, documents, entitlements) to the real local StudyMind AI backend and answers
// only the four AI generation endpoints with deterministic, clearly-marked fixtures:
//   POST /api/chat · /api/quiz/generate · /api/quiz/{id}/submit · /api/flashcards/generate · /api/summarise
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

async function identity(auth) {
  const r = await fetch(`${UPSTREAM}/api/auth/me`, { headers: { Authorization: auth } }).catch(() => null);
  if (!r || !r.ok) return null;
  const me = await r.json().catch(() => null);
  return me?.id ? { id: me.id, role: me.role } : null;
}

function chatAnswer(message) {
  const m = message.toLowerCase();
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
    return send(res, 200, { message_id: randomUUID(), session_id: data.session_id || randomUUID(), answer: a.answer, sources: a.sources, latency_ms: 12, token_count: 99,
      scope: { description: `Module ${String(data.module_id).slice(0, 8)} · ${data.scope_mode ?? 'everything'}`, module_id: data.module_id, scope_mode: data.scope_mode ?? 'everything', document_count: a.sources.length },
      no_content_found: !!a.no_content_found, suggestions: a.suggestions ?? [] });
  }
  if (path === '/api/quiz/generate') {
    if (![data.module_id, data.week_id, data.document_id].some(Boolean) || needModule()) return bad(res, 'module_id required');
    if (!Number.isInteger(data.question_count ?? 10) || (data.question_count ?? 10) < 5 || (data.question_count ?? 10) > 30) return bad(res, 'question_count must be 5..30');
    if (!['mcq', 'short_answer', 'true_false'].includes(data.question_type ?? 'mcq')) return bad(res, 'question_type invalid');
    if (topic.includes('TRIGGER_SLOW')) await sleep(1500);
    const n = Math.min(data.question_count ?? 5, PHYSICS.length);
    const id = randomUUID(); const questions = PHYSICS.slice(0, n).map((q, i) => ({ id: randomUUID(), position: i + 1, question: q.q, options: q.opts.map((t, j) => ({ id: 'abcd'[j], text: t })), correct_answer: q.correct, explanation: q.why, source_chunk: 'physics-notes.pdf', student_answer: null, is_correct: null }));
    attempts.set(id, { owner: me.id, questions });
    return send(res, 201, { id, module_id: data.module_id, title: topic ? `Quiz: ${topic}` : 'Quiz', question_type: 'mcq', question_count: n, status: 'generated', created_at: new Date().toISOString(), questions });
  }
  const submit = path.match(/^\/api\/quiz\/([0-9a-f-]{36})\/submit$/i);
  if (submit) {
    const attempt = attempts.get(submit[1]);
    if (!attempt || attempt.owner !== me.id) return send(res, 404, { detail: 'Quiz not found' });   // like _get_quiz_or_404(attempt, user)
    if (!Array.isArray(data.answers) || !data.answers.length || data.answers.some((a) => !UUID.test(a?.question_id) || typeof a?.answer !== 'string' || !a.answer)) return bad(res, 'answers invalid');
    const map = new Map(data.answers.map((a) => [a.question_id, a.answer]));
    const questions = attempt.questions.map((q) => { const given = (map.get(q.id) || ''); return { ...q, student_answer: given, is_correct: !!given.trim() && given.trim().toLowerCase() === q.correct_answer }; });
    const correct = questions.filter((q) => q.is_correct).length;
    return send(res, 200, { attempt_id: submit[1], score: Math.round((correct / questions.length) * 1000) / 10, total: questions.length, correct, questions });
  }
  if (path === '/api/flashcards/generate') {
    if (![data.module_id, data.week_id, data.document_id].some(Boolean) || needModule()) return bad(res, 'module_id required');
    if (!Number.isInteger(data.max_cards ?? 20) || (data.max_cards ?? 20) < 5 || (data.max_cards ?? 20) > 50) return bad(res, 'max_cards must be 5..50');
    const cards = CARDS.slice(0, Math.min(data.max_cards ?? 20, CARDS.length)).map(([front, back], i) => ({ id: randomUUID(), position: i + 1, front, back, source_chunk: 'physics-notes.pdf', status: 'new' }));
    return send(res, 201, { id: randomUUID(), module_id: data.module_id, title: data.title || 'Flashcards', card_count: cards.length, mastered_count: 0, created_at: new Date().toISOString(), last_studied_at: null, cards });
  }
  if (path === '/api/summarise') {
    if (![data.module_id, data.week_id, data.document_id].some(Boolean) || needModule()) return bad(res, 'module_id required');
    if (!['document', 'week', 'module'].includes(data.scope ?? 'document')) return bad(res, 'scope invalid');
    if (topic.includes('TRIGGER_SLOW')) await sleep(1500);
    return send(res, 201, { id: randomUUID(), module_id: data.module_id, scope: data.scope ?? 'document', source_doc_count: 2, created_at: new Date().toISOString(),
      content: `## Summary${topic ? `: ${topic}` : ''}\n\n- **Newton's laws** relate force, mass and acceleration (F = m a).\n- Momentum is conserved in a closed system.\n\n1. Define the quantities\n2. Apply the laws` });
  }
  return send(res, 404, { detail: 'not a fixture route' });
}

const FIXTURE = /^\/api\/(chat|quiz\/generate|quiz\/[0-9a-f-]{36}\/submit|flashcards\/generate|summarise)$/i;
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const path = url.pathname;
  try {
    if (path === '/__calls') { if (req.method === 'DELETE') { calls.length = 0; return send(res, 200, { cleared: true }); } return send(res, 200, calls); }
    const body = await readBody(req);
    if (req.method === 'POST' && FIXTURE.test(path)) return await fixture(req, res, path, body);
    // Everything else goes to the real backend unchanged.
    const headers = { ...req.headers }; delete headers.host; delete headers['content-length']; delete headers.connection;
    const up = await fetch(UPSTREAM + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, redirect: 'manual' });
    const out = Buffer.from(await up.arrayBuffer());
    const outHeaders = {}; up.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) outHeaders[k] = v; });
    res.writeHead(up.status, outHeaders); res.end(out);
  } catch (e) { send(res, 502, { detail: `shim error: ${e.message}` }); }
}).listen(PORT, '127.0.0.1', () => console.log(`ai-shim on 127.0.0.1:${PORT} -> ${UPSTREAM}`));
