// Final live smoke (development only): the Tutor grounding label, quiz answer-position balance and summary/advice split,
// through Web -> real backend -> budget proxy -> OpenAI, on the corpus created by retrieval-ingest.mjs.
// Asserts that every feature still makes exactly ONE chat call and ONE embedding call (no extra OpenAI calls).
//   STATE=<retrieval state.json> WEB_URL PROXY_URL REPORT=<file> node tests/live/live-final-smoke.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { LiveBudget } from './live-budget.mjs';

const { WEB_URL: WEB, PROXY_URL: PROXY, STATE, REPORT } = process.env;
for (const u of [WEB, PROXY]) if (!u || !['127.0.0.1', 'localhost'].includes(new URL(u).hostname)) { console.error('Local WEB_URL and PROXY_URL required'); process.exit(2); }
const state = JSON.parse(readFileSync(STATE, 'utf8')); const M = state.moduleIds; const PASSWORD = 'Live-Test-Pass-123!';
const budget = await LiveBudget.start({ proxyUrl: PROXY, resume: true });
const report = { checks: [], steps: [] };
const ledgerNow = async () => { const l = await (await fetch(`${PROXY}/__ledger`)).json(); return { chat: l.counts.chat, embed: l.counts.embed, in: l.inputTokens, out: l.outputTokens, usd: l.spentUsd }; };
let last = await ledgerNow();
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${String(detail).slice(0, 150)}]` : ''}`); return !!ok; };
async function step(name, fn, expect) {
  console.log(`\n## ${name}`); const r = await fn(); const n = await ledgerNow();
  const d = { chat: n.chat - last.chat, embed: n.embed - last.embed, inputTokens: n.in - last.in, outputTokens: n.out - last.out, usd: +(n.usd - last.usd).toFixed(6) }; last = n;
  report.steps.push({ name, usage: d, ...r });
  if (expect) check(`${name}: exactly ${expect.chat} chat + ${expect.embed} embedding call(s) (no extra OpenAI calls)`, d.chat === expect.chat && d.embed === expect.embed, `chat=${d.chat} embed=${d.embed}`);
  return r;
}
class Client {
  constructor() { this.jar = new Map(); }
  async req(path, init = {}) {
    const res = await fetch(WEB + path, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); const nme = pair.slice(0, i), v = pair.slice(i + 1); if (/max-age=0/i.test(c) || !v) this.jar.delete(nme); else this.jar.set(nme, v); }
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  json(p, m, d) { return this.req(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); }
}
const stu = new Client();
const login = await stu.json('/api/studymind/auth/login', 'POST', { email: `ret-${state.run}-studentA@example.com`, password: PASSWORD });
check('student A logs in', login.status === 200, `HTTP ${login.status}`);
const ai = (mod, tool, body, sub = '') => budget.generation(() => stu.json(`/api/studymind/modules/${mod}/ai/${tool}${sub}`, 'POST', body));
const chat = (mod, message) => ai(mod, 'chat', { message });

// ── Tutor: grounded vs ungrounded ─────────────────────────────────────────
const t1 = await step('tutor: grounded question', async () => { const r = await chat(M.BIO, 'What is osmosis?'); return { http: r.status, body: r.body }; }, { chat: 1, embed: 1 });
check('grounded: answer flagged grounded, cites the biology document', t1.body?.grounded === true && t1.body.sources.some((s) => s.filename === 'cell-biology-and-energy.docx'), JSON.stringify(t1.body?.sources?.map((s) => s.filename)));
check('grounded: states the real definition', /water potential/i.test(t1.body?.answer ?? ''), t1.body?.answer);

const t2 = await step('tutor: question outside the materials', async () => { const r = await chat(M.BIO, 'Who won the 1966 football World Cup final?'); return { http: r.status, body: r.body }; }, { chat: 1, embed: 1 });
check('ungrounded: flagged NOT grounded', t2.body?.grounded === false, `grounded=${t2.body?.grounded}`);
check('ungrounded: NO citations attached', Array.isArray(t2.body?.sources) && t2.body.sources.length === 0, JSON.stringify(t2.body?.sources));
check('ungrounded: still answers (general knowledge retained)', (t2.body?.answer ?? '').length > 20, t2.body?.answer);

const t3 = await step("tutor: another module's topic asked in Biology", async () => { const r = await chat(M.BIO, 'How does binary search work?'); return { http: r.status, body: r.body }; }, { chat: 1, embed: 1 });
check('cross-module: no Computer Science / Chemistry document is ever cited', !t3.body?.sources?.some((s) => /algorithms|networks|atomic/.test(s.filename)), JSON.stringify(t3.body?.sources?.map((s) => s.filename)));
check('cross-module: grounding flag consistent with citations', t3.body?.grounded === (t3.body?.sources?.length > 0), `grounded=${t3.body?.grounded} sources=${t3.body?.sources?.length}`);
report.crossModuleSpurious = { grounded: t3.body?.grounded, sources: t3.body?.sources?.map((s) => s.filename) };

const t4 = await step('tutor: not-enrolled module is refused before the provider', async () => { const r = await chat(M.CS, 'How does binary search work?'); return { http: r.status }; }, { chat: 0, embed: 0 });
check('not enrolled: 403/404', [403, 404].includes(t4.http), `HTTP ${t4.http}`);

// ── Quiz: positions balanced, correctness intact ─────────────────────────
const positions = [];
for (const n of [1, 2]) {
  const g = await step(`quiz ${n}: generate 5`, async () => { const r = await ai(M.BIO, 'quiz', { question_count: 5 }); return { http: r.status, body: r.body }; }, { chat: 1, embed: 1 });
  const qz = g.body; check(`quiz ${n}: 5 questions with 4 options each`, qz?.questions?.length === 5 && qz.questions.every((q) => q.options.length === 4), `n=${qz?.questions?.length}`);
  const sub = await step(`quiz ${n}: submit`, async () => { const r = await ai(M.BIO, 'quiz', { answers: qz.questions.map((q) => ({ question_id: q.id, answer: q.options[0].id })) }, `/${qz.attempt_id}`); return { http: r.status, result: r.body }; }, { chat: 0, embed: 0 });
  const res = sub.result;
  check(`quiz ${n}: every correct answer is one of its options, with an explanation`, res?.questions?.every((q) => q.options.some((o) => o.id === q.correct_answer) && q.explanation.length > 10));
  const letters = res.questions.map((q) => q.correct_answer); positions.push(...letters); report[`quiz${n}`] = res.questions.map((q) => ({ q: q.question, correct: q.correct_answer, correctText: q.options.find((o) => o.id === q.correct_answer)?.text, options: q.options, explanation: q.explanation }));
  const counts = letters.reduce((a, l) => ({ ...a, [l]: (a[l] || 0) + 1 }), {});
  check(`quiz ${n}: correct answers spread (no letter more than twice in 5): ${JSON.stringify(counts)}`, Math.max(...Object.values(counts)) <= 2, letters.join(''));
  check(`quiz ${n}: explanation letter references (if any) match the correct letter`, res.questions.every((q) => { const m = /\b(?:option|answer|choice)\s+\(?([a-d])\)?(?![a-z])/gi; let x, ok = true; while ((x = m.exec(q.explanation))) if (x[1].toLowerCase() !== q.correct_answer && !/\bnot\b|incorrect|wrong/i.test(q.explanation)) ok = false; return ok; }));
}
const all = positions.reduce((a, l) => ({ ...a, [l]: (a[l] || 0) + 1 }), {}); report.positions = all;
check(`10 questions: at least 3 different positions used: ${JSON.stringify(all)}`, Object.keys(all).length >= 3);

// ── Summary: grounded content separate from advice ───────────────────────
const sm = await step('summary: module summary', async () => { const r = await ai(M.BIO, 'summary', {}); return { http: r.status, body: r.body }; }, { chat: 1, embed: 1 });
const s = sm.body;
check('summary: generated', (s?.content ?? '').length > 200, `len=${s?.content?.length}`);
check('summary: grounded part has no advice or "Exam Tips" section', !/exam tips|general study advice/i.test(s?.content ?? ''));
check('summary: general advice is present and separated', typeof s?.advice === 'string' && s.advice.length > 10, s?.advice);
check('summary: advice contains no subject facts (no biology terms)', !/osmosis|mitochondri|photosynth|enzyme|membrane|ribosome|DNA|cell/i.test(s?.advice ?? ''), s?.advice);
check('summary: grounded part is about the module', /cell|membrane|DNA|enzyme|osmosis/i.test(s?.content ?? ''));
check('summary: grounded part has structure', /^(#{1,4} |[-*] )/m.test(s?.content ?? ''));

report.usage = await budget.report();
const bad = report.checks.filter((c) => !c.ok);
console.log(`\n== ${report.checks.length - bad.length}/${report.checks.length} checks passed; generation attempts ${budget.generations}`);
console.log(`== session provider calls ${JSON.stringify(report.usage.providerCalls)}; tokens ${report.usage.inputTokens}/${report.usage.outputTokens}; est $${report.usage.estimatedUsd.toFixed(5)}`);
for (const f of bad) console.log(`  FAILED: ${f.name} [${String(f.detail).slice(0, 200)}]`);
if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2));
process.exit(bad.length ? 1 : 0);
