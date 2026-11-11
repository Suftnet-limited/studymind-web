// Seeds synthetic UAT data through the Web API (idempotent):  node scripts/uat-seed.mjs [--documents]
//   Accounts: one lecturer, one student (self-learner) - credentials are generated once and kept in
//   ~/.studymind-uat/accounts.json (mode 600). Nothing secret is printed or committed.
//   Modules: class modules created by the lecturer; the student joins Biology only.
//   --documents also uploads the synthetic course files (needs REAL embeddings via the budget proxy; counts against the $5 ceiling)
//   from DOCS_DIR (built with: python tests/fixtures/retrieval/build_docs.py <dir> --realistic).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WEB = process.env.WEB_URL || 'http://127.0.0.1:3100';
const dir = join(homedir(), '.studymind-uat'); mkdirSync(dir, { recursive: true });
const file = join(dir, 'accounts.json');
const accounts = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {
  lecturer: { email: 'uat.lecturer@example.com', full_name: 'UAT Lecturer', password: `Uat-${randomBytes(6).toString('hex')}-A1!`, role: 'lecturer' },
  student: { email: 'uat.student@example.com', full_name: 'UAT Student', password: `Uat-${randomBytes(6).toString('hex')}-B2!`, role: 'self_learner' },
};
writeFileSync(file, JSON.stringify(accounts, null, 2)); chmodSync(file, 0o600);

class Client {
  constructor() { this.jar = new Map(); }
  async req(path, init = {}) {
    const res = await fetch(WEB + path, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); const n = pair.slice(0, i), v = pair.slice(i + 1); if (/max-age=0/i.test(c) || !v) this.jar.delete(n); else this.jar.set(n, v); }
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  json(p, m, d) { return this.req(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); }
}
async function signIn(a) {
  const c = new Client();
  let r = await c.json('/api/studymind/auth/login', 'POST', { email: a.email, password: a.password });
  if (r.status !== 200) {
    r = await c.json('/api/studymind/auth/register', 'POST', a);
    if (![200, 201].includes(r.status)) throw new Error(`register ${a.email}: HTTP ${r.status}`);
  }
  return c;
}
const lec = await signIn(accounts.lecturer), stu = await signIn(accounts.student);
const MODULES = { BIO: 'Introduction to Biology', CS: 'Introduction to Computer Science', CHEM: 'Introduction to Chemistry' };
const have = (await lec.req('/api/studymind/modules')).body;
const owned = Array.isArray(have) ? have : [];
const ids = {};
for (const [key, title] of Object.entries(MODULES)) {
  const m = owned.find((x) => x.title === title);
  if (m) { ids[key] = m.id; continue; }
  const r = await lec.json('/api/studymind/modules', 'POST', { title, access_type: 'class' });
  if (![200, 201].includes(r.status)) throw new Error(`create ${title}: HTTP ${r.status}`);
  ids[key] = r.body.id;
}
const j = await stu.json('/api/studymind/modules/join', 'POST', { course_id: ids.BIO });
console.log(`modules: ${JSON.stringify(ids)}  student join BIO: HTTP ${j.status}`);

if (process.argv.includes('--documents')) {
  const DOCS = process.env.DOCS_DIR; if (!DOCS) throw new Error('DOCS_DIR required with --documents');
  const PLAN = [[lec, 'BIO', 'cell-biology-and-energy.docx', 'class'], [lec, 'BIO', 'genetics-and-evolution.docx', 'class'],
    [lec, 'CS', 'algorithms-and-data-structures.docx', 'class'], [lec, 'CS', 'networks-and-databases.docx', 'class'],
    [lec, 'CHEM', 'atomic-structure-and-bonding.docx', 'class'], [stu, 'BIO', 'student-a-private-notes.docx', 'personal'], [lec, 'BIO', 'lecturer-private-draft.docx', 'personal']];
  for (const [who, key, name, visibility] of PLAN) {
    const list = async () => { const b = (await who.req(`/api/studymind/modules/${ids[key]}/documents`)).body; return Array.isArray(b) ? b : b?.documents ?? []; };
    if ((await list()).some((d) => d.filename === name)) { console.log(`skip (exists) ${name}`); continue; }
    const f = new FormData(); f.set('file', new File([readFileSync(join(DOCS, name))], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); f.set('visibility', visibility);
    const r = await who.req(`/api/studymind/modules/${ids[key]}/documents`, { method: 'POST', body: f });
    let d = null;
    for (let i = 0; i < 60 && !(d && ['indexed', 'failed', 'error'].includes(d.status)); i++) { await new Promise((x) => setTimeout(x, 2000)); d = (await list()).find((x) => x.filename === name); }
    console.log(`${key} ${name} (${visibility}): upload HTTP ${r.status}, ${d?.status} chunks=${d?.chunk_count}`);
  }
}
console.log(`accounts file: ${file} (mode 600)`);
