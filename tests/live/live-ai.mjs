// CONTROLLED live-OpenAI run (development only). Drives StudyMind Web -> real local AI backend -> budget proxy -> OpenAI.
// Refuses to run unless the budget proxy is verifiably in place (see live-budget.mjs). Uses synthetic documents and two
// throwaway accounts (one lecturer, one self-learner). Raw responses are written to REPORT (outside the repo).
//
//   WEB_URL=http://127.0.0.1:3100 AI_URL=http://127.0.0.1:8000 PROXY_URL=http://127.0.0.1:18300 \
//   TS_URL=http://127.0.0.1:18108 TS_KEY=local-test-key FIXTURES=<dir with the 3 .docx> REPORT=<file.json> node tests/live/live-ai.mjs
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { LiveBudget } from './live-budget.mjs';

const { WEB, AI, PROXY_URL: PROXY, TS_URL: TS, TS_KEY, FIXTURES, REPORT } = { WEB: process.env.WEB_URL, AI: process.env.AI_URL, ...process.env };
for (const u of [WEB, AI, PROXY, TS]) if (u && !['127.0.0.1', 'localhost'].includes(new URL(u).hostname)) { console.error('Refusing non-local host'); process.exit(2); }
if (!WEB || !AI || !PROXY || !FIXTURES) { console.error('Set WEB_URL, AI_URL, PROXY_URL, FIXTURES'); process.exit(2); }

const STAGE = process.env.STAGE || 'ingest';   // ingest | generate (generate resumes the ingest run: STATE=<ingest report.json>)
const prev = STAGE === 'generate' ? JSON.parse(readFileSync(process.env.STATE, 'utf8')) : null;
const run = prev ? prev.run : randomBytes(3).toString('hex');
const PASSWORD = 'Live-Test-Pass-123!';
const report = { stage: STAGE, run, startedAt: new Date().toISOString(), steps: [], checks: [] };
const budget = await LiveBudget.start({ proxyUrl: PROXY, resume: STAGE === 'generate' });
let lastLedger = { in: 0, out: 0, usd: 0, chat: 0, embed: 0 };
const ledgerNow = async () => { const l = await (await fetch(`${PROXY}/__ledger`)).json(); return { in: l.inputTokens, out: l.outputTokens, usd: l.spentUsd, chat: l.counts.chat, embed: l.counts.embed }; };
async function delta() { const n = await ledgerNow(); const d = { providerChatCalls: n.chat - lastLedger.chat, embedCalls: n.embed - lastLedger.embed, inputTokens: n.in - lastLedger.in, outputTokens: n.out - lastLedger.out, usd: +(n.usd - lastLedger.usd).toFixed(6) }; lastLedger = n; return d; }
lastLedger = await ledgerNow();   // per-step usage is measured from here (a resumed stage keeps earlier spend in the totals)
function check(name, ok, detail = '') { report.checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); return !!ok; }
async function step(name, fn) { console.log(`\n## ${name}`); const t0 = Date.now(); let out; try { out = await fn(); } catch (e) { out = { error: e.message }; console.log(`  ERROR ${e.message}`); } report.steps.push({ name, ms: Date.now() - t0, usage: await delta(), ...out }); return out; }

class Client {
  constructor() { this.jar = new Map(); }
  async req(path, init = {}) {
    const res = await fetch(WEB + path, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); const n = pair.slice(0, i), v = pair.slice(i + 1); if (/max-age=0/i.test(c) || !v) this.jar.delete(n); else this.jar.set(n, v); }
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  json(p, m, d) { return this.req(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); }
  upload(modId, name, bytes, visibility) { const f = new FormData(); f.set('file', new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); f.set('visibility', visibility); return this.req(`/api/studymind/modules/${modId}/documents`, { method: 'POST', body: f }); }
}
const lec = new Client(), stu = new Client();
const reg = async (c, tag, role) => { const r = await c.json('/api/studymind/auth/register', 'POST', { email: `live-${run}-${tag}@example.com`, full_name: `Live ${tag}`, password: PASSWORD, role }); if (r.status !== 201) throw new Error(`register ${tag}: ${r.status}`); return r; };
const ai = (c, mod, tool, body, sub = '') => c.json(`/api/studymind/modules/${mod}/ai/${tool}${sub}`, 'POST', body);
const gen = (fn) => budget.generation(fn);

// ── Accounts, modules, uploads ────────────────────────────────────────────
const M = {};
await step('accounts and modules', async () => {
  if (STAGE === 'generate') {   // resume: same accounts and modules as the ingest stage, fresh login (also exercises login)
    const ids = prev.steps.find((s) => s.name === 'accounts and modules').moduleIds; Object.assign(M, { A: { id: ids.A }, B: { id: ids.B }, P: { id: ids.P } });
    for (const [c, tag] of [[lec, 'lecturer'], [stu, 'studentA']]) { const r = await c.json('/api/studymind/auth/login', 'POST', { email: `live-${run}-${tag}@example.com`, password: PASSWORD }); check(`login ${tag}`, r.status === 200, `HTTP ${r.status}`); }
    return { resumed: true };
  }
  await reg(lec, 'lecturer', 'lecturer'); await reg(stu, 'studentA', 'self_learner');
  M.A = (await lec.json('/api/studymind/modules', 'POST', { title: 'Introduction to Biology', access_type: 'class' })).body;
  M.B = (await lec.json('/api/studymind/modules', 'POST', { title: 'Introduction to Computer Science', access_type: 'class' })).body;
  M.P = (await stu.json('/api/studymind/modules', 'POST', { title: 'Student A Personal Notes', access_type: 'personal' })).body;
  const j = await stu.json('/api/studymind/modules/join', 'POST', { course_id: M.A.id });
  check('student A enrolled in Module A', j.status === 200, `join ${j.status}`);
  // Student A is deliberately NOT enrolled in Module B (cross-module isolation is tested below).
  return { moduleIds: { A: M.A.id, B: M.B.id, P: M.P.id } };
});
const save = () => { if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2)); };
if (!M.A?.id || !M.B?.id || !M.P?.id) { console.error('setup failed'); save(); process.exit(1); }

const docs = async (c, mod) => { const r = await c.req(`/api/studymind/modules/${mod}/documents`); const b = r.body; return Array.isArray(b) ? b : b?.documents ?? b?.items ?? []; };
async function waitIndexed(c, mod, filename) {
  for (let i = 0; i < 45; i++) { const d = (await docs(c, mod)).find((x) => x.filename === filename); if (d && ['indexed', 'failed', 'error'].includes(d.status)) return d; await new Promise((r) => setTimeout(r, 2000)); }
  return null;
}
const tsSearch = async (q, filter) => { if (!TS) return null; const u = `${TS}/collections/document_chunks/documents/search?q=${encodeURIComponent(q)}&query_by=content&per_page=50${filter ? `&filter_by=${encodeURIComponent(filter)}` : ''}`; return (await fetch(u, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } })).json(); };

// ── Task 3: ingestion through the real upload pipeline ────────────────────
const UP = [['A', lec, 'biology-intro.docx', 'class', 'BIO-CANARY-ZEBRA-4417'], ['B', lec, 'cs-intro.docx', 'class', 'CS-CANARY-OTTER-8820'], ['P', stu, 'student-a-personal-notes.docx', 'personal', 'PERSONAL-CANARY-LLAMA-5503']];
const doc = {};
for (const [k, c, name, vis] of STAGE === 'ingest' ? UP : []) {
  await step(`upload + index ${name}`, async () => {
    const r = await budget.upload(() => c.upload(M[k].id, name, readFileSync(`${FIXTURES}/${name}`), vis));
    check(`${name} accepted`, r.status === 200 || r.status === 201, `HTTP ${r.status}`);
    doc[k] = await waitIndexed(c, M[k].id, name);
    check(`${name} indexed`, doc[k]?.status === 'indexed', `status=${doc[k]?.status} chunks=${doc[k]?.chunk_count}`);
    return { status: doc[k]?.status, chunkCount: doc[k]?.chunk_count, visibility: doc[k]?.visibility };
  });
}
if (STAGE === 'ingest') await step('typesense: chunks, metadata, isolation', async () => {
  const out = {};
  for (const [k, , name, , canary] of UP) {
    const inMod = await tsSearch(canary, `module_id:=${M[k].id}`);
    out[k] = { chunksWithCanaryInOwnModule: inMod?.found, sampleFields: inMod?.hits?.[0] ? Object.keys(inMod.hits[0].document).sort() : [] };
    const d0 = inMod?.hits?.[0]?.document; if (d0) out[k].metadata = { module_id_ok: d0.module_id === M[k].id, visibility: d0.visibility, is_latest: d0.is_latest, doc_version: d0.doc_version, has_owner: !!d0.owner_id };
    check(`${name}: canary chunk exists under its own module`, (inMod?.found ?? 0) >= 1, `found=${inMod?.found}`);
    for (const [k2] of UP) if (k2 !== k) { const x = await tsSearch(canary, `module_id:=${M[k2].id}`); check(`${name}: canary NOT present in module ${k2}`, (x?.found ?? 0) === 0, `found=${x?.found}`); }
  }
  const all = await tsSearch('*', ''); out.totalChunks = all?.found; return out;
});
save();

// ── Task 4: the four AI features, through the Web proxy ───────────────────
// FOREIGN_A: anything that belongs to Module B or to Student A's personal notes must never appear in Module A output.
const FOREIGN_A = [/binary search/i, /\bLIFO\b/i, /hash table/i, /mock exam/i, /14 March/i, /Apples Taste/i, /CANARY-(OTTER|LLAMA)/i];
const leaks = (t, list) => list.filter((r) => r.test(t)).map(String);
const preview = (t, n = 700) => (t ?? '').replace(/\s+/g, ' ').slice(0, n);
const tutor = async (name, c, mod, message, session_id) => step(name, async () => {
  const before = (await ledgerNow()).chat;
  const r = await gen(() => ai(c, mod, 'chat', { message, ...(session_id ? { session_id } : {}) }));
  const calls = (await ledgerNow()).chat - before;
  return { question: message, http: r.status, answer: r.body?.answer, sources: (r.body?.sources ?? []).map((s) => s.filename), sessionId: r.body?.session_id, noContentFound: r.body?.no_content_found, providerChatCalls: calls, error: r.body?.error };
});
const S = {};
if (STAGE === 'generate') {
  S.t1 = await tutor('tutor 1: direct question (Module A)', stu, M.A.id, 'What do mitochondria do, and how do they produce ATP?');
  check('T1 HTTP 200', S.t1.http === 200, `HTTP ${S.t1.http}`);
  check('T1 answers from material (ATP + oxidative phosphorylation)', /ATP/i.test(S.t1.answer ?? '') && /oxidative phosphorylation/i.test(S.t1.answer ?? ''), preview(S.t1.answer, 160));
  check('T1 cites biology-intro.docx', (S.t1.sources ?? []).includes('biology-intro.docx'), JSON.stringify(S.t1.sources));
  check('T1 cites only real uploaded documents (no invented sources)', (S.t1.sources ?? []).every((f) => ['biology-intro.docx'].includes(f)), JSON.stringify(S.t1.sources));

  S.t2 = await tutor('tutor 2: follow-up in the same session', stu, M.A.id, 'How does that connect to the endosymbiotic theory?', S.t1.sessionId);
  check('T2 follow-up reuses the session', S.t2.sessionId === S.t1.sessionId, `${S.t2.sessionId === S.t1.sessionId}`);
  check('T2 mentions mitochondrial own/circular DNA', /(own|circular)\s+(circular\s+)?DNA/i.test(S.t2.answer ?? ''), preview(S.t2.answer, 160));

  S.t3 = await tutor('tutor 3: question outside the uploaded material', stu, M.A.id, 'Who won the 1966 football World Cup final?');
  check('T3 invents no source documents', (S.t3.sources ?? []).every((f) => f === 'biology-intro.docx'), JSON.stringify(S.t3.sources));

  S.t4 = await tutor('tutor 4: another module\'s topic asked inside Module A', stu, M.A.id, 'What is the time complexity of binary search, and what does LIFO mean?');
  check('T4 does not cite Module B documents', !(S.t4.sources ?? []).includes('cs-intro.docx'), JSON.stringify(S.t4.sources));
  check('T4 no Module B canary / personal canary in answer', leaks(S.t4.answer ?? '', [/CANARY-(OTTER|LLAMA)/i]).length === 0);

  S.t5 = await step('tutor 5: Student A asks in Module B (not enrolled)', async () => {
    const before = (await ledgerNow()).chat;
    const r = await gen(() => ai(stu, M.B.id, 'chat', { message: 'What is binary search?' }));
    return { http: r.status, providerChatCalls: (await ledgerNow()).chat - before, body: r.body };
  });
  check('T5 refused (403/404)', [403, 404].includes(S.t5.http), `HTTP ${S.t5.http}`);
  check('T5 refused BEFORE the provider (0 chat calls)', S.t5.providerChatCalls === 0, `${S.t5.providerChatCalls}`);

  S.t6 = await tutor('tutor 6: personal notes module (own material)', stu, M.P.id, 'When is my biology mock exam, and what mnemonic did I invent for base pairing?');
  check('T6 uses personal notes (14 March, Apples)', /14 March/i.test(S.t6.answer ?? '') && /Apples/i.test(S.t6.answer ?? ''), preview(S.t6.answer, 160));
  check('T6 cites the personal notes', (S.t6.sources ?? []).includes('student-a-personal-notes.docx'), JSON.stringify(S.t6.sources));

  S.t7 = await tutor('tutor 7: personal facts must not leak into Module A', stu, M.A.id, 'When is my biology mock exam, and what mnemonic did I invent for base pairing?');
  check('T7 personal facts absent from Module A answer', leaks(S.t7.answer ?? '', [/14 March/i, /Apples Taste/i, /PERSONAL-CANARY/i]).length === 0, preview(S.t7.answer, 160));
  check('T7 no personal document cited in Module A', !(S.t7.sources ?? []).includes('student-a-personal-notes.docx'), JSON.stringify(S.t7.sources));

  S.t8 = await tutor('tutor 8: Module B as its lecturer', lec, M.B.id, 'What is the time complexity of binary search, and which data structure is LIFO?');
  check('T8 correct (O(log n), stack)', /O\(log n\)/i.test(S.t8.answer ?? '') && /stack/i.test(S.t8.answer ?? ''), preview(S.t8.answer, 160));
  check('T8 cites cs-intro.docx', (S.t8.sources ?? []).includes('cs-intro.docx'), JSON.stringify(S.t8.sources));

  // Quiz
  S.quiz = await step('quiz: generate 5 MCQ (Module A)', async () => {
    const r = await gen(() => ai(stu, M.A.id, 'quiz', { question_count: 5 }));
    return { http: r.status, attemptId: r.body?.attempt_id, questions: r.body?.questions };
  });
  check('quiz generated 5 questions with options', S.quiz.http === 201 || S.quiz.http === 200 ? (S.quiz.questions ?? []).length === 5 && S.quiz.questions.every((q) => q.options.length >= 3) : false, `HTTP ${S.quiz.http} n=${S.quiz.questions?.length}`);
  check('quiz hides correct answers/explanations before submit', S.quiz.questions?.every((q) => q.correct_answer === undefined && q.explanation === undefined));
  S.sub = await step('quiz: submit (first option for every question)', async () => {
    const r = await ai(stu, M.A.id, 'quiz', { answers: S.quiz.questions.map((q) => ({ question_id: q.id, answer: q.options[0].id })) }, `/${S.quiz.attemptId}`);
    return { http: r.status, result: r.body };
  });
  const qr = S.sub.result;
  check('quiz scored', S.sub.http === 200 && qr?.total === 5, `HTTP ${S.sub.http} score=${qr?.score} correct=${qr?.correct}/${qr?.total}`);
  check('quiz score consistent with per-question marking', qr && qr.correct === qr.questions.filter((q) => q.is_correct).length && Math.abs(qr.score - (qr.correct / qr.total) * 100) < 1.01);
  check('quiz every correct_answer is one of its options, with an explanation', qr?.questions.every((q) => q.options.some((o) => o.id === q.correct_answer) && q.explanation.length > 10));
  check('quiz has no Module B / personal content', leaks(JSON.stringify(qr), FOREIGN_A).length === 0, leaks(JSON.stringify(qr), FOREIGN_A).join(','));

  // Flashcards
  S.fc = await step('flashcards: generate 6 (Module A)', async () => {
    const r = await gen(() => ai(stu, M.A.id, 'flashcards', { max_cards: 6 }));
    return { http: r.status, cards: r.body?.cards };
  });
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  check('flashcards generated', (S.fc.cards ?? []).length >= 5, `HTTP ${S.fc.http} n=${S.fc.cards?.length}`);
  check('flashcards: no duplicate fronts', new Set((S.fc.cards ?? []).map((c) => norm(c.front))).size === (S.fc.cards ?? []).length);
  check('flashcards: no Module B / personal content', leaks(JSON.stringify(S.fc.cards), FOREIGN_A).length === 0, leaks(JSON.stringify(S.fc.cards), FOREIGN_A).join(','));

  // Summary
  S.sum = await step('summary: module summary (Module A)', async () => {
    const r = await gen(() => ai(stu, M.A.id, 'summary', {}));
    return { http: r.status, content: r.body?.content, sourceDocCount: r.body?.source_doc_count };
  });
  check('summary generated', (S.sum.content ?? '').length > 200, `HTTP ${S.sum.http} len=${S.sum.content?.length}`);
  check('summary covers the document (mitochondria, photosynthesis, DNA)', ['mitochondri', 'photosynthesis', 'DNA'].every((w) => new RegExp(w, 'i').test(S.sum.content ?? '')));
  check('summary: no Module B / personal content', leaks(S.sum.content ?? '', FOREIGN_A).length === 0, leaks(S.sum.content ?? '', FOREIGN_A).join(','));
  check('summary has structure (headings or bullets)', /^(#{1,4} |[-*] |\d+\. )/m.test(S.sum.content ?? ''));
}

// ── usage report ──────────────────────────────────────────────────────────
report.usage = await budget.report();
report.finishedAt = new Date().toISOString();
const failed = report.checks.filter((c) => !c.ok);
console.log(`\n== ${report.checks.length - failed.length}/${report.checks.length} checks passed; generation attempts ${budget.generations}/20, uploads ${budget.uploads}/5`);
console.log(`== provider: ${JSON.stringify(report.usage.providerCalls)}, tokens in/out ${report.usage.inputTokens}/${report.usage.outputTokens}, estimated $${report.usage.estimatedUsd.toFixed(5)}`);
for (const f of failed) console.log(`  FAILED: ${f.name} [${f.detail}]`);
save();
process.exit(failed.length ? 1 : 0);
