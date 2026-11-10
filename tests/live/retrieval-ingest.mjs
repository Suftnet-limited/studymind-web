// Ingests the synthetic retrieval corpus through the REAL upload path (Web -> backend -> embeddings -> Typesense).
//   WEB_URL PROXY_URL FIXTURES=<docx dir> STATE_OUT=<file.json> [REALISTIC=1] [RESUME=1] [MAX_UPLOADS=n] node tests/live/retrieval-ingest.mjs
// Live mode (default): budget-guarded (uploads, $5, fail-closed) via the budget proxy. REALISTIC=1 also uploads the two private
// privacy-canary documents (7 uploads in total, so pass MAX_UPLOADS=8; the default cap is 5).
// STUB_MODE=1: no budget proxy and NO real OpenAI - the backend must be using the recording stand-in. Only the isolation and
// privacy checks are meaningful in that mode (embeddings are constant); relevance metrics are not.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { AGREED, LiveBudget } from './live-budget.mjs';

const { WEB_URL: WEB, PROXY_URL: PROXY, FIXTURES, STATE_OUT } = process.env;
const STUB = process.env.STUB_MODE === '1', REALISTIC = process.env.REALISTIC === '1';
if (!WEB || !['127.0.0.1', 'localhost'].includes(new URL(WEB).hostname)) { console.error('Local WEB_URL required'); process.exit(2); }
if (!STUB && (!PROXY || !['127.0.0.1', 'localhost'].includes(new URL(PROXY).hostname))) { console.error('Local PROXY_URL required (or STUB_MODE=1)'); process.exit(2); }
const maxUploads = Number(process.env.MAX_UPLOADS || AGREED.maxUploads);
const budget = STUB ? null : await LiveBudget.start({ proxyUrl: PROXY, resume: process.env.RESUME === '1', limits: { ...AGREED, maxUploads } });
const upload = (fn) => (budget ? budget.upload(fn) : fn());
const run = randomBytes(3).toString('hex'); const PASSWORD = 'Live-Test-Pass-123!';
const MODULES = { BIO: ['Introduction to Biology', ['cell-biology-and-energy.docx', 'genetics-and-evolution.docx']], CS: ['Introduction to Computer Science', ['algorithms-and-data-structures.docx', 'networks-and-databases.docx']], CHEM: ['Introduction to Chemistry', ['atomic-structure-and-bonding.docx']] };
const PRIVATE = REALISTIC ? [['student-a-private-notes.docx', 'BIO', 'student'], ['lecturer-private-draft.docx', 'BIO', 'lecturer']] : [];

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
const state = { run, mode: STUB ? 'stub' : 'live', realistic: REALISTIC, moduleIds: {}, docs: {}, userIds: {} };
ok(await lec.json('/api/studymind/auth/register', 'POST', { email: `ret-${run}-lecturer@example.com`, full_name: 'Ret lecturer', password: PASSWORD, role: 'lecturer' }), 'register lecturer');
ok(await stu.json('/api/studymind/auth/register', 'POST', { email: `ret-${run}-studentA@example.com`, full_name: 'Ret student A', password: PASSWORD, role: 'self_learner' }), 'register student');
state.userIds.lecturer = ok(await lec.req('/api/studymind/learning-overview'), 'lecturer overview').user.id;
state.userIds.student = ok(await stu.req('/api/studymind/learning-overview'), 'student overview').user.id;

async function put(client, modId, name, visibility, key) {
  const f = new FormData(); f.set('file', new File([readFileSync(`${FIXTURES}/${name}`)], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); f.set('visibility', visibility);
  ok(await upload(() => client.req(`/api/studymind/modules/${modId}/documents`, { method: 'POST', body: f })), `upload ${name}`);
  let d = null;
  for (let i = 0; i < 90 && !(d && ['indexed', 'failed', 'error'].includes(d.status)); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const b = (await client.req(`/api/studymind/modules/${modId}/documents`)).body; d = (Array.isArray(b) ? b : b?.documents ?? []).find((x) => x.filename === name);
  }
  state.docs[name] = { module: key, status: d?.status, chunks: d?.chunk_count, visibility };
  console.log(`${key} ${name} (${visibility}): ${d?.status} chunks=${d?.chunk_count}`);
}
for (const [key, [title, files]] of Object.entries(MODULES)) {
  const mod = ok(await lec.json('/api/studymind/modules', 'POST', { title, access_type: 'class' }), `create ${key}`);
  state.moduleIds[key] = mod.id;
  for (const name of files) await put(lec, mod.id, name, 'class', key);
}
// The student joins Biology only, then private documents go into Biology: personal visibility, owned by their uploader.
ok(await stu.json('/api/studymind/modules/join', 'POST', { course_id: state.moduleIds.BIO }), 'student joins BIO');
for (const [name, key, who] of PRIVATE) await put(who === 'student' ? stu : lec, state.moduleIds[key], name, 'personal', key);
if (budget) state.report = await budget.report();
writeFileSync(STATE_OUT, JSON.stringify(state, null, 2));
const bad = Object.values(state.docs).filter((d) => d.status !== 'indexed');
console.log(`${STUB ? 'STUB MODE (no OpenAI)' : `uploads ${budget.uploads}/${maxUploads}, embed calls ${state.report.providerCalls.embed}, est $${state.report.estimatedUsd.toFixed(5)}`}; not indexed: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
