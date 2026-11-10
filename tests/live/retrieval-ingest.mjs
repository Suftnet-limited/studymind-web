// Ingests the synthetic retrieval corpus through the REAL upload path (Web -> backend -> real embeddings -> Typesense).
// Budget-guarded (5 uploads, $5, fail-closed). Writes the module/document ids to STATE_OUT for retrieval_eval.py and the smoke run.
//   WEB_URL AI_URL PROXY_URL FIXTURES=<docx dir> STATE_OUT=<file.json> node tests/live/retrieval-ingest.mjs
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { LiveBudget } from './live-budget.mjs';

const { WEB_URL: WEB, PROXY_URL: PROXY, FIXTURES, STATE_OUT } = process.env;
for (const u of [WEB, PROXY]) if (!u || !['127.0.0.1', 'localhost'].includes(new URL(u).hostname)) { console.error('Local WEB_URL and PROXY_URL required'); process.exit(2); }
const budget = await LiveBudget.start({ proxyUrl: PROXY, resume: process.env.RESUME === '1' });   // RESUME=1: a second corpus on the same proxy/ledger
const run = randomBytes(3).toString('hex'); const PASSWORD = 'Live-Test-Pass-123!';
const MODULES = { BIO: ['Introduction to Biology', ['cell-biology-and-energy.docx', 'genetics-and-evolution.docx']], CS: ['Introduction to Computer Science', ['algorithms-and-data-structures.docx', 'networks-and-databases.docx']], CHEM: ['Introduction to Chemistry', ['atomic-structure-and-bonding.docx']] };

class Client {
  constructor() { this.jar = new Map(); }
  async req(path, init = {}) {
    const res = await fetch(WEB + path, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); const n = pair.slice(0, i), v = pair.slice(i + 1); if (/max-age=0/i.test(c) || !v) this.jar.delete(n); else this.jar.set(n, v); }
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  json(p, m, d) { return this.req(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); }
}
const lec = new Client(), stu = new Client();
const ok = (r, what) => { if (![200, 201].includes(r.status)) throw new Error(`${what}: HTTP ${r.status}`); return r.body; };
const state = { run, moduleIds: {}, docs: {} };
ok(await lec.json('/api/studymind/auth/register', 'POST', { email: `ret-${run}-lecturer@example.com`, full_name: 'Ret lecturer', password: PASSWORD, role: 'lecturer' }), 'register lecturer');
ok(await stu.json('/api/studymind/auth/register', 'POST', { email: `ret-${run}-studentA@example.com`, full_name: 'Ret student A', password: PASSWORD, role: 'self_learner' }), 'register student');
for (const [key, [title, files]] of Object.entries(MODULES)) {
  const mod = ok(await lec.json('/api/studymind/modules', 'POST', { title, access_type: 'class' }), `create ${key}`);
  state.moduleIds[key] = mod.id;
  for (const name of files) {
    const f = new FormData(); f.set('file', new File([readFileSync(`${FIXTURES}/${name}`)], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); f.set('visibility', 'class');
    ok(await budget.upload(() => lec.req(`/api/studymind/modules/${mod.id}/documents`, { method: 'POST', body: f })), `upload ${name}`);
    let d = null;
    for (let i = 0; i < 60 && !(d && ['indexed', 'failed', 'error'].includes(d.status)); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const b = (await lec.req(`/api/studymind/modules/${mod.id}/documents`)).body; d = (Array.isArray(b) ? b : b?.documents ?? []).find((x) => x.filename === name);
    }
    state.docs[name] = { module: key, status: d?.status, chunks: d?.chunk_count };
    console.log(`${key} ${name}: ${d?.status} chunks=${d?.chunk_count}`);
  }
}
// The student joins Biology only (used by the end-to-end smoke run).
ok(await stu.json('/api/studymind/modules/join', 'POST', { course_id: state.moduleIds.BIO }), 'student joins BIO');
state.report = await budget.report();
writeFileSync(STATE_OUT, JSON.stringify(state, null, 2));
const bad = Object.values(state.docs).filter((d) => d.status !== 'indexed');
console.log(`uploads ${budget.uploads}/5, embed calls ${state.report.providerCalls.embed}, tokens ${state.report.inputTokens}, est $${state.report.estimatedUsd.toFixed(5)}; not indexed: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
