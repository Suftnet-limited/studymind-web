// UAT journeys with REAL AI through the Web app:  node scripts/uat-journeys.mjs   (stack running with real AI; ~10 chat calls)
// Uses the seeded accounts in ~/.studymind-uat/accounts.json. Prints PASS/FAIL per check, never any secret.
import { readFileSync } from 'node:fs';
const A = JSON.parse(readFileSync(`${process.env.HOME}/.studymind-uat/accounts.json`, 'utf8'));
const W = process.env.WEB_URL || 'http://127.0.0.1:3100', PROXY = process.env.PROXY_URL || 'http://127.0.0.1:18301';
class C { jar = new Map();
  async req(p, i = {}) { const r = await fetch(W + p, { ...i, redirect: 'manual', headers: { ...(i.headers || {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [pr] = c.split(';'); const n = pr.split('=')[0], v = pr.slice(n.length + 1); if (/max-age=0/i.test(c) || !v) this.jar.delete(n); else this.jar.set(n, v); }
    return { s: r.status, b: await r.json().catch(() => null) }; }
  j(p, m, d) { return this.req(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); } }
let pass = 0, fail = 0; const out = [];
const t = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? `  [${String(x).slice(0, 170)}]` : ''}`); };
const pv = (s) => (s ?? '').replace(/\s+/g, ' ').slice(0, 220);
const stu = new C(), lec = new C();
await stu.j('/api/studymind/auth/login', 'POST', A.student); await lec.j('/api/studymind/auth/login', 'POST', A.lecturer);
const mods = (await lec.req('/api/studymind/modules')).b; const id = (k) => mods.find((m) => m.title.includes(k)).id;
const BIO = id('Biology'), CS = id('Computer');
const ai = (c, m, tool, body, sub = '') => c.j(`/api/studymind/modules/${m}/ai/${tool}${sub}`, 'POST', body);
const src = (r) => (r.b?.sources ?? []).map((s) => s.filename ?? s);
const BIO_DOCS = ['cell-biology-and-energy.docx', 'genetics-and-evolution.docx', 'student-a-private-notes.docx'];
const FOREIGN = [/binary search/i, /\bLIFO\b/i, /hash table/i, /LECTURER-CANARY/i, /isotope/i];
const leaks = (s) => FOREIGN.filter((r) => r.test(s)).map(String);
const ledger0 = await (await fetch(`${PROXY}/__ledger`)).json();

console.log('--- Student: Tutor');
const t1 = await ai(stu, BIO, 'chat', { message: 'What is the difference between prokaryotic and eukaryotic cells?' });
t('T1 answers from material', t1.s === 200 && /nucle/i.test(t1.b?.answer ?? ''), `HTTP ${t1.s} ${pv(t1.b?.answer)}`);
t('T1 cites uploaded Biology documents only', src(t1).length > 0 && src(t1).every((f) => BIO_DOCS.includes(f)) && src(t1).includes('cell-biology-and-energy.docx'), JSON.stringify(src(t1)));
const t2 = await ai(stu, BIO, 'chat', { message: 'And which of those has membrane-bound organelles?', session_id: t1.b?.session_id });
t('T2 follow-up keeps the session', t2.s === 200 && t2.b?.session_id === t1.b?.session_id, pv(t2.b?.answer));
const t3 = await ai(stu, BIO, 'chat', { message: 'Who won the 1966 football World Cup final?' });
t('T3 off-topic: not presented as grounded, no invented citations', t3.s === 200 && src(t3).every((f) => BIO_DOCS.includes(f)) && (t3.b?.grounded === false || src(t3).length === 0), `grounded=${t3.b?.grounded} sources=${JSON.stringify(src(t3))} ${pv(t3.b?.answer)}`);
const t4 = await ai(stu, BIO, 'chat', { message: 'How does binary search work and what is a hash table?' });
t('T4 other-module topic asked in Biology: no CS documents cited, no CS answer leakage', !src(t4).some((f) => /algorithms|networks/.test(f)), `${JSON.stringify(src(t4))} ${pv(t4.b?.answer)}`);
const t5 = await ai(stu, BIO, 'chat', { message: 'When is my private biology mock exam and what is my revision codeword?' });
t('T5 student retrieves their OWN private note', /PERSONAL-CANARY-LLAMA-5503/.test(t5.b?.answer ?? '') && src(t5).includes('student-a-private-notes.docx'), `${JSON.stringify(src(t5))} ${pv(t5.b?.answer)}`);
const t6 = await ai(stu, BIO, 'chat', { message: 'What is on the unreleased draft exam paper and its marking scheme codeword?' });
t("T6 student cannot see the lecturer's private draft", !/LECTURER-CANARY|OTTER/i.test(JSON.stringify(t6.b)) && !src(t6).includes('lecturer-private-draft.docx'), `${JSON.stringify(src(t6))} ${pv(t6.b?.answer)}`);
const t7 = await ai(stu, CS, 'chat', { message: 'What is binary search?' });
t('T7 module boundary: not-enrolled module refused, no AI answer', [403, 404].includes(t7.s) && !t7.b?.answer, `HTTP ${t7.s}`);

console.log('--- Student: Quiz');
const q = await ai(stu, BIO, 'quiz', { question_count: 5 });
const qs = q.b?.questions ?? [];
t('Q1 quiz generated (5 questions, 3+ options each)', [200, 201].includes(q.s) && qs.length === 5 && qs.every((x) => x.options?.length >= 3), `HTTP ${q.s} n=${qs.length}`);
t('Q2 correct answers hidden before submit', qs.every((x) => x.correct_answer === undefined && x.explanation === undefined));
const pos = qs.map((x) => x.options.length);
const sub = await ai(stu, BIO, 'quiz', { answers: qs.map((x) => ({ question_id: x.id, answer: x.options[0].id })) }, `/${q.b?.attempt_id}`);
const r = sub.b;
t('Q3 quiz submitted and scored consistently', sub.s === 200 && r?.total === 5 && r.correct === r.questions.filter((x) => x.is_correct).length, `HTTP ${sub.s} ${r?.correct}/${r?.total} score=${r?.score}`);
t('Q4 every result has a valid correct answer + explanation', !!r?.questions?.every((x) => x.options.some((o) => o.id === x.correct_answer) && (x.explanation ?? '').length > 10));
t('Q5 quiz contains no other-module or lecturer-private content', leaks(JSON.stringify(r)).length === 0, leaks(JSON.stringify(r)).join(','));

console.log('--- Student: Flashcards');
const f = await ai(stu, BIO, 'flashcards', { max_cards: 6 }); const cards = f.b?.cards ?? [];
t('F1 flashcards generated', [200, 201].includes(f.s) && cards.length >= 5, `HTTP ${f.s} n=${cards.length}`);
t('F2 cards have front and back, no duplicates', cards.every((c) => c.front && c.back) && new Set(cards.map((c) => c.front.toLowerCase())).size === cards.length);
t('F3 flashcards contain no other-module or lecturer-private content', leaks(JSON.stringify(cards)).length === 0, leaks(JSON.stringify(cards)).join(','));
console.log('    sample card:', pv(cards[0]?.front), '->', pv(cards[0]?.back));

console.log('--- Student: Summary');
const s = await ai(stu, BIO, 'summary', {});
t('S1 summary generated', [200, 201].includes(s.s) && (s.b?.content ?? '').length > 200, `HTTP ${s.s} len=${s.b?.content?.length}`);
t('S2 summary covers the Biology material', /cell|mitosis|DNA|gene/i.test(s.b?.content ?? ''), pv(s.b?.content));
t('S3 summary contains no other-module or lecturer-private content', leaks(s.b?.content ?? '').length === 0, leaks(s.b?.content ?? '').join(','));

console.log('--- Lecturer');
const l1 = await ai(lec, BIO, 'chat', { message: 'What is the codeword on my unreleased draft exam paper?' });
t('L1 lecturer retrieves their OWN private draft', /LECTURER-CANARY-OTTER-8820/.test(l1.b?.answer ?? '') && src(l1).includes('lecturer-private-draft.docx'), `${JSON.stringify(src(l1))} ${pv(l1.b?.answer)}`);
const l2 = await ai(lec, BIO, 'chat', { message: 'What is my private revision codeword for my own notes and when is my mock exam?' });
t("L2 lecturer cannot see the student's private notes", !/PERSONAL-CANARY|LLAMA-5503/i.test(JSON.stringify(l2.b)) && !src(l2).includes('student-a-private-notes.docx'), `${JSON.stringify(src(l2))} ${pv(l2.b?.answer)}`);
const ld = (await lec.req(`/api/studymind/modules/${BIO}/documents`)).b; const ldn = (Array.isArray(ld) ? ld : ld?.documents ?? []).map((d) => d.filename);
t('L3 lecturer document list shows class docs and own draft, not the student private note', ldn.includes('cell-biology-and-energy.docx') && ldn.includes('lecturer-private-draft.docx') && !ldn.includes('student-a-private-notes.docx'), JSON.stringify(ldn));
const sd = (await stu.req(`/api/studymind/modules/${BIO}/documents`)).b; const sdn = (Array.isArray(sd) ? sd : sd?.documents ?? []).map((d) => d.filename);
t("L4 student document list shows class docs and own note, not the lecturer's draft", sdn.includes('cell-biology-and-energy.docx') && sdn.includes('student-a-private-notes.docx') && !sdn.includes('lecturer-private-draft.docx'), JSON.stringify(sdn));
const f2 = new FormData(); f2.set('file', new File([readFileSync(`${process.env.HOME}/.studymind-uat/docs/student-a-private-notes.docx`)], 'x.docx')); f2.set('visibility', 'class');
const su = await stu.req(`/api/studymind/modules/${BIO}/documents`, { method: 'POST', body: f2 });
t('L5 student cannot upload a CLASS document', su.s >= 400, `HTTP ${su.s}`);
const lcs = await ai(lec, CS, 'chat', { message: 'What is binary search?' });
t('L6 lecturer can use AI in their own CS module', lcs.s === 200 && /search/i.test(lcs.b?.answer ?? ''), `HTTP ${lcs.s} ${JSON.stringify(src(lcs))}`);

const l = await (await fetch(`${PROXY}/__ledger`)).json();
console.log(`\n${pass} passed, ${fail} failed | proxy this run: chat ${l.counts.chat - ledger0.counts.chat}, embed ${l.counts.embed - ledger0.counts.embed}, refused ${l.refused - ledger0.refused}, spend +$${(l.spentUsd - ledger0.spentUsd).toFixed(5)}, total $${l.spentUsd.toFixed(5)} of $5`);
process.exit(fail ? 1 : 0);
