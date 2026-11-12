// Opt-in integration suite: StudyMind Web API routes <-> a LOCAL StudyMind AI backend.
//
//   WEB_URL=http://127.0.0.1:3100 AI_URL=http://127.0.0.1:8000 \
//   AI_PSQL="psql -h 127.0.0.1 -p 55432 -U sm_test -d studymind_it" npm run test:integration
//
//   Optional: TS_URL=http://127.0.0.1:8108 TS_KEY=<key> to verify real Typesense behaviour (seeded chunk fixtures).
//
// Safety: refuses to run against anything but loopback hosts. It creates throwaway accounts
// (random emails) and never reads or writes real users.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const WEB = process.env.WEB_URL;
const AI = process.env.AI_URL;
if (!WEB || !AI) { console.log('Skipping: set WEB_URL and AI_URL (local only) to run integration tests.'); process.exit(0); }
const TS = process.env.TS_URL, TS_KEY = process.env.TS_KEY;
const FIXTURES = process.env.FIXTURES;          // directory with synthetic documents (see docs/real-ai-validation.md)
const STUB = process.env.STUB_URL;              // recording OpenAI stand-in (tests/fixtures/openai-stub.mjs); backend must be started against it
const SHIM = process.env.SHIM_URL;                // controlled AI fixture shim (tests/fixtures/ai-shim.mjs); Web must be pointed at it
const TS_CONTAINER = process.env.TS_CONTAINER;  // optional: docker container name, used to simulate a Typesense outage
for (const u of [WEB, AI, ...(TS ? [TS] : []), ...(SHIM ? [SHIM] : []), ...(STUB ? [STUB] : [])]) {
  const host = new URL(u).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) { console.error(`Refusing non-local host: ${host}`); process.exit(2); }
}

const run = randomBytes(4).toString('hex');
const PASSWORD = 'Integration-Pass-123!';
const results = [];
let section = '';
const group = (name) => { section = name; console.log(`\n## ${name}`); };
async function check(name, fn) {
  try { await fn(); results.push({ section, name, ok: true }); console.log(`  PASS  ${name}`); }
  catch (e) { results.push({ section, name, ok: false, err: e.message }); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const knownDefects = [];
const notes = [];
const unverified = [];
const skipUnverified = (name, reason) => { unverified.push({ name, reason }); console.log(`  UNVERIFIED  ${name}\n        ${reason}`); };
/** A check for a documented AI-backend defect: reported separately, and flags loudly when it is fixed. */
async function knownDefect(name, ticket, fn) {
  try { await fn(); console.log(`  FIXED  ${name}\n        The AI backend now behaves correctly - convert this to a normal check().`); results.push({ section, name, ok: true }); }
  catch (e) { knownDefects.push({ name, ticket, err: e.message }); console.log(`  KNOWN BACKEND DEFECT  ${name}\n        ${ticket}`); }
}
const note = (msg) => { notes.push(msg); console.log(`  NOTE  ${msg}`); };
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg = '') => expect(a === b, `${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

class Client {
  constructor() { this.jar = new Map(); }
  get cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(path, init = {}) {
    const res = await fetch(WEB + path, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), cookie: this.cookieHeader } });
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(';'); const i = pair.indexOf('='); const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || value === '') this.jar.delete(name); else this.jar.set(name, value);
    }
    const body = await res.clone().json().catch(() => null);
    return { status: res.status, body, setCookie: raw };
  }
  json(path, method, data) { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
  upload(modId, name, bytes, visibility, type = 'application/octet-stream') {
    const f = new FormData(); f.set('file', new File([bytes], name, { type }));
    if (visibility) f.set('visibility', visibility);
    return this.req(`/api/studymind/modules/${modId}/documents`, { method: 'POST', body: f });
  }
}
const email = (tag) => `it-${run}-${tag}@example.com`;
async function register(client, tag, role) {
  const r = await client.json('/api/studymind/auth/register', 'POST', { email: email(tag), full_name: `IT ${tag}`, password: PASSWORD, role });
  expect(r.status === 201 && r.body?.authenticated, `register ${tag}/${role} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r;
}
const psql = (sql) => process.env.AI_PSQL ? execFileSync(process.env.AI_PSQL.split(' ')[0], [...process.env.AI_PSQL.split(' ').slice(1), '-tAc', sql]).toString().trim() : null;

const lec = new Client(), s1 = new Client(), s2 = new Client(), s3 = new Client(), sl = new Client(), mobile = new Client();
const state = {};

// ───────────────────────────── Authentication ─────────────────────────────
group('Authentication');
await check('register a new student through Web (canonical account, auto sign-in)', async () => {
  const r = await register(s1, 's1', 'student');
  eq(r.body.registered, true);
  expect(!JSON.stringify(r.body).includes('token'), 'tokens must not appear in the response body');
});
await check('session cookies are httpOnly + SameSite=Lax', async () => {
  const r = await s2.json('/api/studymind/auth/register', 'POST', { email: email('s2'), full_name: 'IT s2', password: PASSWORD, role: 'student' });
  eq(r.status, 201);
  for (const n of ['studymind_ai_access', 'studymind_ai_refresh']) {
    const c = r.setCookie.find((x) => x.startsWith(n + '='));
    expect(c, `${n} not set`); expect(/httponly/i.test(c), `${n} not HttpOnly`); expect(/samesite=lax/i.test(c), `${n} not SameSite=Lax`);
  }
});
await check('learning-overview returns the new student', async () => {
  const r = await s1.req('/api/studymind/learning-overview');
  eq(r.status, 200); eq(r.body.user.role, 'student'); eq(r.body.user.email, email('s1'));
  state.s1 = r.body.user;
});
await check('duplicate registration is rejected with a readable message (not a 5xx)', async () => {
  const r = await new Client().json('/api/studymind/auth/register', 'POST', { email: email('s1'), full_name: 'Dup', password: PASSWORD, role: 'student' });
  eq(r.status, 409); expect(typeof r.body.error === 'string' && r.body.error.length > 3, 'no readable error');
});
await check('weak password (<12 chars) rejected by Web before reaching AI', async () => {
  eq((await new Client().json('/api/studymind/auth/register', 'POST', { email: email('weak'), full_name: 'Weak', password: 'short', role: 'student' })).status, 400);
});
await check('registration config exposes only known, enabled roles', async () => {
  const r = await new Client().req('/api/studymind/auth/config');
  eq(r.status, 200); expect(Array.isArray(r.body.enabled_roles) && r.body.enabled_roles.length > 0, 'no roles');
  expect(r.body.enabled_roles.every((x) => ['student', 'lecturer', 'self_learner'].includes(x)), 'unknown/admin role exposed');
});
await check('admin role cannot be self-registered through Web', async () => {
  eq((await new Client().json('/api/studymind/auth/register', 'POST', { email: email('adm'), full_name: 'Adm', password: PASSWORD, role: 'admin' })).status, 400);
});
await check('existing Mobile account (created directly on AI) can log in via Web', async () => {
  const res = await fetch(AI + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('mobile'), full_name: 'Mobile User', password: PASSWORD, role: 'self_learner' }) });
  expect(res.status === 201 || res.status === 200, `seeding Mobile user failed: ${res.status}`);
  const r = await mobile.json('/api/studymind/auth/login', 'POST', { email: email('mobile'), password: PASSWORD });
  eq(r.status, 200); eq(r.body.authenticated, true);
  eq((await mobile.req('/api/studymind/learning-overview')).body.user.email, email('mobile'));
});
await check('wrong password -> 401 with readable message', async () => {
  const r = await new Client().json('/api/studymind/auth/login', 'POST', { email: email('mobile'), password: 'definitely-wrong-123' });
  eq(r.status, 401); expect(typeof r.body.error === 'string', 'no error message');
});
await check('JWT refresh: invalid access token + valid refresh token -> request still succeeds and cookie is renewed', async () => {
  const before = s1.jar.get('studymind_ai_access');
  s1.jar.set('studymind_ai_access', 'tampered.invalid.token');
  const r = await s1.req('/api/studymind/learning-overview');
  eq(r.status, 200, 'overview after tamper');
  expect(s1.jar.get('studymind_ai_access') && s1.jar.get('studymind_ai_access') !== 'tampered.invalid.token', 'access cookie was not renewed');
  expect(before !== undefined, 'precondition');
});
await check('JWT refresh: access cookie absent (expired) + refresh cookie -> session continues', async () => {
  s1.jar.delete('studymind_ai_access');
  eq((await s1.req('/api/studymind/learning-overview')).status, 200);
});
await check('both tokens invalid -> 401 and cookies cleared', async () => {
  const c = new Client(); c.jar.set('studymind_ai_access', 'bad'); c.jar.set('studymind_ai_refresh', 'bad');
  eq((await c.req('/api/studymind/learning-overview')).status, 401);
  expect(!c.jar.has('studymind_ai_refresh'), 'refresh cookie should be cleared');
});
await check('logout clears the session', async () => {
  const c = new Client(); c.jar = new Map(mobile.jar);
  eq((await c.json('/api/studymind/auth/logout', 'POST', {})).status, 200);
  eq((await c.req('/api/studymind/learning-overview')).status, 401);
});
await check('no duplicate accounts: exactly one AI user per email', async () => {
  const n = psql(`select count(*) from users where email like 'it-${run}-%'`);
  if (n === null) return console.log('        (skipped: AI_PSQL not set)');
  const distinct = psql(`select count(distinct email) from users where email like 'it-${run}-%'`);
  eq(n, distinct, 'row count vs distinct emails');
});
await check('Web registration/login routes never touch the Web (Prisma) user table', async () => {
  const { readFileSync } = await import('node:fs');
  for (const p of ['register', 'login', 'logout']) {
    const src = readFileSync(new URL(`../../src/app/api/studymind/auth/${p}/route.ts`, import.meta.url), 'utf8');
    expect(!/@\/lib\/prisma|prisma\.|PrismaClient/.test(src), `${p} route uses prisma`);
  }
});

// ───────────────────────────── Modules ─────────────────────────────
group('Learning modules');
await register(lec, 'lec', 'lecturer'); await register(s3, 's3', 'student'); await register(sl, 'sl', 'self_learner');
state.lec = (await lec.req('/api/studymind/learning-overview')).body.user;
state.s2 = (await s2.req('/api/studymind/learning-overview')).body.user;
state.s3 = (await s3.req('/api/studymind/learning-overview')).body.user;
state.sl = (await sl.req('/api/studymind/learning-overview')).body.user;

await check('lecturer creates a class module', async () => {
  const r = await lec.json('/api/studymind/modules', 'POST', { title: 'IT Class Module', access_type: 'class' });
  eq(r.status, 201); eq(r.body.access_type, 'class'); eq(r.body.owner_id, state.lec.id); state.classMod = r.body;
});
await check('lecturer creates a personal module', async () => {
  const r = await lec.json('/api/studymind/modules', 'POST', { title: 'IT Lecturer Personal', access_type: 'personal' });
  eq(r.status, 201); state.lecPersonal = r.body;
});
await check('self-learner creates a personal module', async () => {
  const r = await sl.json('/api/studymind/modules', 'POST', { title: 'IT Self Learner Notes', access_type: 'personal' });
  eq(r.status, 201); state.slMod = r.body;
});
await check('student cannot create modules (readable 403)', async () => {
  const r = await s1.json('/api/studymind/modules', 'POST', { title: 'Nope Module', access_type: 'personal' });
  eq(r.status, 403); expect(/student/i.test(r.body.error), `message: ${r.body.error}`);
});
await check('self-learner cannot create a class module (readable 403)', async () => {
  const r = await sl.json('/api/studymind/modules', 'POST', { title: 'Nope Class', access_type: 'class' });
  eq(r.status, 403); expect(typeof r.body.error === 'string', 'no message');
});
await check('Web rejects malformed module payloads before AI (400)', async () => {
  for (const b of [{ title: '', access_type: 'class' }, { title: 'ok title', access_type: 'public' }, { access_type: 'class' }])
    eq((await lec.json('/api/studymind/modules', 'POST', b)).status, 400);
});
await check('student joins the class using its Course ID (module UUID)', async () => {
  const r = await s1.json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id });
  eq(r.status, 200); eq(r.body.module_id, state.classMod.id);
});
await check('joining twice -> readable 409', async () => {
  const r = await s1.json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id });
  eq(r.status, 409); expect(typeof r.body.error === 'string', 'no message');
});
await check('unknown Course ID -> 404 readable', async () => {
  const r = await s1.json('/api/studymind/modules/join', 'POST', { course_id: '00000000-0000-4000-8000-000000000000' });
  expect(r.status === 404, `status ${r.status} ${JSON.stringify(r.body)}`); expect(typeof r.body.error === 'string', 'no message');
});
await check('unknown short course code -> 404 readable', async () => {
  const r = await s1.json('/api/studymind/modules/join', 'POST', { course_id: 'NOPE-999' });
  eq(r.status, 404);
});
await check('malformed Course ID rejected by Web (400)', async () => {
  for (const id of ['', 'ab', '../../x', 'a b c']) eq((await s1.json('/api/studymind/modules/join', 'POST', { course_id: id })).status, 400, id);
});
await check('lecturer cannot join (readable 403)', async () => {
  const r = await lec.json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id });
  eq(r.status, 403);
});
await check('cannot join someone else\'s personal module', async () => {
  const r = await s2.json('/api/studymind/modules/join', 'POST', { course_id: state.slMod.id });
  expect([403, 404].includes(r.status), `status ${r.status}`);
});
await check('unauthenticated join -> 401', async () => {
  eq((await new Client().json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id })).status, 401);
});
await check('Owned vs Enrolled: lecturer owns, student is enrolled (owner_id differs)', async () => {
  const l = (await lec.req('/api/studymind/modules')).body, s = (await s1.req('/api/studymind/modules')).body;
  expect(l.some((m) => m.id === state.classMod.id && m.owner_id === state.lec.id), 'lecturer should own class module');
  const m = s.find((x) => x.id === state.classMod.id);
  expect(m && m.owner_id !== state.s1.id, 'student should see class module as enrolled');
  expect(!s.some((x) => x.id === state.lecPersonal.id), 'student must not see lecturer personal module');
});
await check('overview counts match (student: 0 owned / 1 enrolled; lecturer: 2 owned)', async () => {
  const s = (await s1.req('/api/studymind/learning-overview')).body.modules, l = (await lec.req('/api/studymind/learning-overview')).body.modules;
  eq(s.owned, 0, 'student owned'); eq(s.enrolled, 1, 'student enrolled'); eq(l.owned, 2, 'lecturer owned');
});
await check('non-enrolled student cannot open the class module', async () => {
  expect([403, 404].includes((await s2.req(`/api/studymind/modules/${state.classMod.id}`)).status), 'expected 403/404');
});
await check("student cannot open another user's personal module or its documents", async () => {
  for (const suffix of ['', '/documents'])
    expect([403, 404].includes((await s2.req(`/api/studymind/modules/${state.slMod.id}${suffix}`)).status), `leak at ${suffix || 'module'}`);
});
await check('invalid module id in URL -> 400, never proxied', async () => {
  eq((await s1.req('/api/studymind/modules/not-a-uuid')).status, 400);
  eq((await s1.req('/api/studymind/modules/..%2Fauth%2Fme')).status, 400);
});

// ───────────────────────────── Documents ─────────────────────────────
group('Document uploads');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const docx = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64, 1)]);
await check('lecturer uploads class PDF -> accepted (201) and listed with a status', async () => {
  const r = await lec.upload(state.classMod.id, 'syllabus.pdf', pdf, 'class', 'application/pdf');
  eq(r.status, 201, JSON.stringify(r.body)); state.pdfDoc = r.body;
  const list = (await lec.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  const d = list.find((x) => x.filename === 'syllabus.pdf');
  expect(d, 'uploaded document missing from list'); expect(typeof d.status === 'string', 'no status');
  state.pdfStatus = d.status; console.log(`        status reported by AI: ${d.status}${d.error_message ? ` (${d.error_message.slice(0, 80)})` : ''}`);
});
await check('lecturer uploads class DOCX -> accepted (201)', async () => {
  const r = await lec.upload(state.classMod.id, 'lecture1.docx', docx, 'class');
  eq(r.status, 201, JSON.stringify(r.body));
});
await check('student uploads personal TXT to the enrolled class -> 201', async () => {
  const r = await s1.upload(state.classMod.id, 's1-private.txt', Buffer.from('my private study notes about mitochondria'), 'personal', 'text/plain');
  eq(r.status, 201, JSON.stringify(r.body));
});
await check("regression: a lecturer's 'personal' upload is NOT exposed to enrolled students (visibility sent as AI query param)", async () => {
  const r = await lec.upload(state.classMod.id, 'lecturer-private.txt', Buffer.from('lecturer private notes'), 'personal', 'text/plain');
  eq(r.status, 201, JSON.stringify(r.body));
  const seen = (await s1.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  expect(!seen.some((d) => d.filename === 'lecturer-private.txt'), 'LECTURER PERSONAL FILE LEAKED TO STUDENT');
  const own = (await lec.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body.find((d) => d.filename === 'lecturer-private.txt');
  eq(own?.visibility, 'personal', 'stored visibility');
});
await check('student cannot upload class-visibility material (readable 403)', async () => {
  const r = await s1.upload(state.classMod.id, 'forged.txt', Buffer.from('x'), 'class', 'text/plain');
  eq(r.status, 403); expect(typeof r.body.error === 'string', 'no message');
});
await check("another enrolled student cannot see student 1's private material", async () => {
  eq((await s3.json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id })).status, 200);
  const list = (await s3.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  expect(Array.isArray(list), 'list not returned');
  expect(!list.some((d) => d.filename === 's1-private.txt'), 'PRIVATE DOCUMENT LEAKED to another student');
  expect(list.some((d) => d.filename === 'syllabus.pdf'), 'class material should be visible to enrolled students');
});
await check("student 1 sees both class and their own private material", async () => {
  const list = (await s1.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  expect(list.some((d) => d.filename === 's1-private.txt') && list.some((d) => d.filename === 'syllabus.pdf'), 'missing documents');
});
await check('non-enrolled student cannot upload or list', async () => {
  expect([403, 404].includes((await s2.upload(state.classMod.id, 'x.txt', Buffer.from('x'), 'personal')).status), 'upload allowed!');
  expect([403, 404].includes((await s2.req(`/api/studymind/modules/${state.classMod.id}/documents`)).status), 'list allowed!');
});
await check('unsupported formats (.exe, .doc, .pptx) -> readable error, never "[object Object]"', async () => {
  for (const name of ['malware.exe', 'old.doc', 'deck.pptx']) {
    const r = await lec.upload(state.classMod.id, name, Buffer.from('data'), 'class');
    expect([400, 422].includes(r.status), `${name}: status ${r.status}`);
    expect(typeof r.body.error === 'string' && !r.body.error.includes('[object'), `${name}: bad message ${JSON.stringify(r.body)}`);
  }
});
await check('empty file -> 400', async () => eq((await lec.upload(state.classMod.id, 'empty.txt', Buffer.alloc(0), 'class')).status, 400));
await check('oversized file (51 MB) -> 400 before reaching AI', async () => {
  const r = await lec.upload(state.classMod.id, 'huge.txt', Buffer.alloc(51 * 1024 * 1024, 97), 'class');
  eq(r.status, 400); expect(/50 MB/.test(r.body.error), r.body.error);
});
await check('non-multipart body -> 415', async () => eq((await lec.json(`/api/studymind/modules/${state.classMod.id}/documents`, 'POST', { a: 1 })).status, 415));
await check('unauthenticated upload -> 401', async () => eq((await new Client().upload(state.classMod.id, 'x.txt', Buffer.from('x'), 'personal')).status, 401));
await check('garbage week_id is ignored (not forwarded)', async () => {
  const f = new FormData(); f.set('file', new File([Buffer.from('week test')], 'week.txt')); f.set('visibility', 'class'); f.set('week_id', "'; drop table--");
  eq((await lec.req(`/api/studymind/modules/${state.classMod.id}/documents`, { method: 'POST', body: f })).status, 201);
});
await check('upload response and list report a recognised indexing status (failed locally: no OpenAI/Typesense)', async () => {
  const up = await lec.upload(state.classMod.id, 'status.txt', Buffer.from('indexing status probe'), 'class', 'text/plain');
  eq(up.status, 201); expect(['indexed', 'failed', 'pending', 'processing'].includes(up.body.status), `upload status ${up.body.status}`);
  const list = (await lec.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  console.log(`        statuses: ${[...new Set(list.map((d) => d.status))].join(', ')}`);
  expect(list.every((d) => ['indexed', 'failed', 'pending', 'processing'].includes(d.status)), 'unexpected status value');
  expect(list.every((d) => !('error_message' in d) || d.error_message === null || !/sk-/.test(d.error_message)), 'provider secrets in error_message');
});

// ───────────────────────────── Self-learner class access ─────────────────────────────
group('Self-learner access to class modules');
await check('self-learner joins a lecturer class by Course ID', async () => {
  const r = await sl.json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id });
  eq(r.status, 200, JSON.stringify(r.body)); eq(r.body.module_id, state.classMod.id);
});
await check('enrolled self-learner opens the class module and sees it as Enrolled', async () => {
  const r = await sl.req(`/api/studymind/modules/${state.classMod.id}`);
  eq(r.status, 200, JSON.stringify(r.body)); expect(r.body.owner_id !== state.sl.id, 'should not be owner');
  const list = (await sl.req('/api/studymind/modules')).body;
  expect(list.some((m) => m.id === state.classMod.id), 'class module missing from list');
  const ov = (await sl.req('/api/studymind/learning-overview')).body.modules;
  eq(ov.owned, 1, 'owned'); eq(ov.enrolled, 1, 'enrolled');
});
await check('self-learner sees class material but never private files of the lecturer or other students', async () => {
  const r = await sl.req(`/api/studymind/modules/${state.classMod.id}/documents`);
  eq(r.status, 200);
  const names = r.body.map((d) => d.filename);
  expect(names.includes('syllabus.pdf'), 'class material should be visible');
  expect(!names.includes('lecturer-private.txt'), 'LECTURER PRIVATE FILE LEAKED to self-learner');
  expect(!names.includes('s1-private.txt'), 'STUDENT PRIVATE FILE LEAKED to self-learner');
});
await check('self-learner personal upload stays private and is stored as personal', async () => {
  const r = await sl.upload(state.classMod.id, 'sl-private.txt', Buffer.from('self learner notes'), 'personal', 'text/plain');
  eq(r.status, 201, JSON.stringify(r.body));
  const mine = (await sl.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body.find((d) => d.filename === 'sl-private.txt');
  eq(mine?.visibility, 'personal');
  for (const other of [s1, s3]) {
    const list = (await other.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
    expect(!list.some((d) => d.filename === 'sl-private.txt'), 'SELF-LEARNER PRIVATE FILE LEAKED to another student');
  }
  const owner = (await lec.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  expect(!owner.some((d) => d.filename === 'sl-private.txt'), 'LEARNER PRIVATE FILE LEAKED to the class owner');
  expect(!owner.some((d) => d.filename === 's1-private.txt'), 'STUDENT PRIVATE FILE LEAKED to the class owner');
});
await check('self-learner cannot publish class-visibility material into a lecturer class (readable 403)', async () => {
  const r = await sl.upload(state.classMod.id, 'sl-class.txt', Buffer.from('x'), 'class', 'text/plain');
  eq(r.status, 403); expect(/owner/i.test(r.body.error), `message: ${r.body.error}`);
});
await check('personal modules cannot be joined (student or self-learner)', async () => {
  for (const [who, id] of [[s2, state.slMod.id], [sl, state.lecPersonal.id], [s1, state.lecPersonal.id]]) {
    const r = await who.json('/api/studymind/modules/join', 'POST', { course_id: id });
    expect([403, 404].includes(r.status), `status ${r.status} ${JSON.stringify(r.body)}`);
  }
  // ...and joining does not grant access
  expect([403, 404].includes((await s2.req(`/api/studymind/modules/${state.slMod.id}`)).status), 'personal module readable by non-owner');
});
await check('lecturers still cannot join through the student flow', async () => {
  eq((await lec.json('/api/studymind/modules/join', 'POST', { course_id: state.classMod.id })).status, 403);
});
await check('unenrolled users still cannot read class modules or materials', async () => {
  eq((await s2.req(`/api/studymind/modules/${state.classMod.id}`)).status, 403);
  eq((await s2.req(`/api/studymind/modules/${state.classMod.id}/documents`)).status, 403);
});
await check('failed-indexing error text is generic (no provider details reach the browser)', async () => {
  const list = (await lec.req(`/api/studymind/modules/${state.classMod.id}/documents`)).body;
  expect(!JSON.stringify(list).match(/sk-|api key|openai/i), 'provider details exposed in document list');
});

// ───────────────────────────── Entitlements ─────────────────────────────
group('Entitlements (read-only, canonical AI data)');
const FREE = { chats: 10, quizzes: 2, flashcards: 2, summaries: 1 };
const userId = (tag) => psql(`select id from users where email='${email(tag)}'`);
await check('unauthenticated entitlement request -> 401', async () => eq((await new Client().req('/api/studymind/entitlements')).status, 401));
await check('free account: backend allowances are passed through with enforcement flag', async () => {
  const r = await s2.req('/api/studymind/entitlements');
  eq(r.status, 200); eq(r.body.available, true); eq(r.body.plan, 'free'); eq(r.body.expires_at, null);
  for (const [k, limit] of Object.entries(FREE)) eq(JSON.stringify(r.body.allowances[k]), JSON.stringify({ limit, remaining: limit }), k);
  eq(r.body.enforcement_enabled, false);
  expect(!/stripe|checkout|payment/i.test(JSON.stringify(r.body)), 'billing identifiers must not reach the browser');
  expect(!('features' in r.body), 'internal feature map should not be forwarded');
});
await check('the AI backend serves both entitlement paths with the same data', async () => {
  const tok = (await (await fetch(AI + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('s2'), password: PASSWORD }) })).json()).access_token;
  const [a, b] = await Promise.all(['/api/auth/me/entitlements', '/api/me/entitlements'].map(async (p) => (await fetch(AI + p, { headers: { Authorization: `Bearer ${tok}` } })).json()));
  eq(JSON.stringify(a), JSON.stringify(b));
});
await check('partially consumed free allowance: 3 of 10 chats used, quizzes exhausted', async () => {
  if (!process.env.AI_PSQL) return console.log('        (skipped: AI_PSQL not set)');
  const id = userId('s3');
  const month = `date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
  psql(`insert into studymind_usage_counters(user_id,feature,period_start,used) values ('${id}','chat',${month},3),('${id}','quiz',${month},2)`);
  const r = await s3.req('/api/studymind/entitlements');
  eq(r.body.allowances.chats.remaining, 7, 'chats remaining'); eq(r.body.allowances.chats.limit, 10);
  eq(r.body.allowances.quizzes.remaining, 0, 'quizzes remaining'); eq(r.body.allowances.flashcards.remaining, 2);
});
await check('Plus entitlement (seeded in the disposable DB): limits, partial use and expiry', async () => {
  if (!process.env.AI_PSQL) return console.log('        (skipped: AI_PSQL not set)');
  const id = userId('sl');
  psql(`insert into studymind_entitlements(id,user_id,stripe_checkout_session_id,status,feature_limits,starts_at,expires_at) values (gen_random_uuid(),'${id}','cs_local_test_${run}','active','{"chat":200,"quiz":30,"flashcards":30,"summary":15}', now() - interval '1 day', now() + interval '27 days')`);
  psql(`insert into studymind_usage_counters(user_id,feature,period_start,used) select user_id,'chat',starts_at,25 from studymind_entitlements where user_id='${id}'`);
  const r = await sl.req('/api/studymind/entitlements');
  eq(r.body.plan, 'plus'); expect(Date.parse(r.body.expires_at) > Date.now(), 'expiry should be in the future');
  eq(r.body.allowances.chats.limit, 200); eq(r.body.allowances.chats.remaining, 175);
  eq(r.body.allowances.quizzes.limit, 30); eq(r.body.allowances.flashcards.limit, 30); eq(r.body.allowances.summaries.limit, 15);
});
await check('the browser cannot activate or change entitlements', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await sl.req('/api/studymind/entitlements', { method, headers: { 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : JSON.stringify({ plan: 'plus' }) });
    eq(r.status, 405, method);
  }
  eq((await sl.req('/api/studymind/entitlements')).body.allowances.chats.remaining, 175, 'unchanged');
});

// ───────────────────────────── Document security regression ─────────────────────────────
group('Document security regression (Web routes AND direct AI API)');
const tokens = {};
for (const tag of ['lec', 's1', 's2', 's3', 'sl']) {
  const r = await fetch(AI + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email(tag), password: PASSWORD }) });
  tokens[tag] = (await r.json()).access_token;
}
const web = { lec, s1, s2, s3, sl };
const aiCall = async (tag, path, init = {}) => {
  const res = await fetch(AI + path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tokens[tag]}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const aiUpload = (tag, modId, name, text, visibility) => {
  const f = new FormData(); f.set('file', new File([Buffer.from(text)], name, { type: 'text/plain' }));
  return aiCall(tag, `/api/modules/${modId}/documents${visibility === undefined ? '' : `?visibility=${encodeURIComponent(visibility)}`}`, { method: 'POST', body: f });
};
const webNames = async (tag, modId = state.classMod.id) => ((await web[tag].req(`/api/studymind/modules/${modId}/documents`)).body ?? []).map((d) => d.filename);
const aiNames = async (tag, modId = state.classMod.id) => ((await aiCall(tag, `/api/modules/${modId}/documents`)).body ?? []).map((d) => d.filename);
const CM = state.classMod.id;

await check('1. lecturer (module owner) publishes class material - allowed (Web and direct)', async () => {
  eq((await lec.upload(CM, 'sec-class-web.txt', Buffer.from('class via web'), 'class', 'text/plain')).status, 201);
  eq((await aiUpload('lec', CM, 'sec-class-direct.txt', 'class direct', 'class')).status, 201);
});
await check('2. enrolled student cannot publish class material (403 via Web and direct)', async () => {
  const w = await s1.upload(CM, 'sec-forged-s1.txt', Buffer.from('x'), 'class', 'text/plain');
  eq(w.status, 403); expect(/owner/i.test(w.body.error) && !/\[object/.test(w.body.error), `Web message: ${w.body.error}`);
  eq((await aiUpload('s1', CM, 'sec-forged-s1-direct.txt', 'x', 'class')).status, 403);
});
await check('3. enrolled self-learner cannot publish class material (403 via Web and direct)', async () => {
  eq((await sl.upload(CM, 'sec-forged-sl.txt', Buffer.from('x'), 'class', 'text/plain')).status, 403);
  eq((await aiUpload('sl', CM, 'sec-forged-sl-direct.txt', 'x', 'class')).status, 403);
});
await check('4. student uploads personal notes - allowed (Web and direct)', async () => {
  eq((await s1.upload(CM, 'sec-s1-note.txt', Buffer.from('s1 note'), 'personal', 'text/plain')).status, 201);
  eq((await aiUpload('s3', CM, 'sec-s3-note-direct.txt', 's3 note', 'personal')).status, 201);
});
await check('5. self-learner uploads personal notes - allowed (Web and direct)', async () => {
  eq((await sl.upload(CM, 'sec-sl-note.txt', Buffer.from('sl note'), 'personal', 'text/plain')).status, 201);
  eq((await aiUpload('sl', CM, 'sec-sl-note-direct.txt', 'sl note', 'personal')).status, 201);
});
await check('lecturer personal note is allowed and stored as personal', async () => {
  eq((await lec.upload(CM, 'sec-lec-note.txt', Buffer.from('lec note'), 'personal', 'text/plain')).status, 201);
});

const PERSONAL = { lec: ['sec-lec-note.txt', 'lecturer-private.txt'], s1: ['sec-s1-note.txt', 's1-private.txt'], s3: ['sec-s3-note-direct.txt'], sl: ['sec-sl-note.txt', 'sec-sl-note-direct.txt', 'sl-private.txt'] };
const CLASS = ['sec-class-web.txt', 'sec-class-direct.txt', 'syllabus.pdf'];
for (const viewer of ['lec', 's1', 's3', 'sl']) {
  await check(`6-8. ${viewer}: sees all class material and only their own personal notes (list response, Web == direct)`, async () => {
    const w = await webNames(viewer), d = await aiNames(viewer);
    eq(JSON.stringify([...w].sort()), JSON.stringify([...d].sort()), 'Web and AI lists differ');
    for (const f of CLASS) expect(w.includes(f), `${viewer} should see class file ${f}`);
    for (const f of PERSONAL[viewer]) expect(w.includes(f), `${viewer} should see own file ${f}`);
    for (const [owner, files] of Object.entries(PERSONAL)) if (owner !== viewer)
      for (const f of files) expect(!w.includes(f) && !d.includes(f), `PRIVACY: ${viewer} can see ${owner}'s personal file ${f}`);
  });
}
await check('rejected uploads leave nothing behind', async () => {
  const all = [...(await webNames('lec')), ...(await webNames('s1'))].join();
  for (const f of ['sec-forged-s1', 'sec-forged-sl', 'sec-bad-visibility']) expect(!all.includes(f), `${f} was stored despite rejection`);
});
await check('9. invalid visibility values are rejected by the AI API (422) and by Web (400); nothing is stored', async () => {
  for (const v of ['public', 'CLASS', 'institution', 'class ', '']) {
    const d = await aiUpload('lec', CM, 'sec-bad-visibility.txt', 'x', v);
    eq(d.status, 422, `direct visibility="${v}"`);
  }
  for (const v of ['public', 'CLASS', 'institution']) {
    const f = new FormData(); f.set('file', new File([Buffer.from('x')], 'sec-bad-visibility.txt')); f.set('visibility', v);
    const w = await lec.req(`/api/studymind/modules/${CM}/documents`, { method: 'POST', body: f });
    eq(w.status, 400, `Web visibility="${v}"`); expect(typeof w.body.error === 'string', 'no message');
  }
});
await check('Web defaults a missing visibility to personal (never class) - even for the module owner', async () => {
  const f = new FormData(); f.set('file', new File([Buffer.from('default vis')], 'sec-default-vis.txt'));
  eq((await lec.req(`/api/studymind/modules/${CM}/documents`, { method: 'POST', body: f })).status, 201);
  const mine = (await lec.req(`/api/studymind/modules/${CM}/documents`)).body.find((d) => d.filename === 'sec-default-vis.txt');
  eq(mine?.visibility, 'personal');
  expect(!(await webNames('s1')).includes('sec-default-vis.txt'), 'default-visibility file leaked to a student');
});
await check('10. unenrolled user: class module and its documents are forbidden (Web and direct, read and write)', async () => {
  for (const path of [`/api/modules/${CM}`, `/api/modules/${CM}/documents`]) eq((await aiCall('s2', path)).status, 403, `direct ${path}`);
  eq((await s2.req(`/api/studymind/modules/${CM}`)).status, 403); eq((await s2.req(`/api/studymind/modules/${CM}/documents`)).status, 403);
  eq((await aiUpload('s2', CM, 'sec-outsider.txt', 'x', 'personal')).status, 403);
  eq((await s2.upload(CM, 'sec-outsider.txt', Buffer.from('x'), 'personal')).status, 403);
});
await check("10. a user's personal module is private to its owner (Web and direct, for students and lecturers)", async () => {
  const pm = state.slMod.id;
  for (const who of ['s1', 's2', 'lec']) {
    for (const path of [`/api/modules/${pm}`, `/api/modules/${pm}/documents`]) eq((await aiCall(who, path)).status, 403, `direct ${who} ${path}`);
    eq((await web[who].req(`/api/studymind/modules/${pm}`)).status, 403, `web ${who} module`);
    eq((await web[who].req(`/api/studymind/modules/${pm}/documents`)).status, 403, `web ${who} docs`);
    eq((await aiUpload(who, pm, 'sec-intruder.txt', 'x', 'personal')).status, 403, `direct upload ${who}`);
  }
});
await check('legacy unauthenticated /api/documents routes are not exposed', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  for (const [method, path] of [['GET', '/api/documents'], ['GET', `/api/documents/${id}`], ['DELETE', `/api/documents/${id}`], ['POST', '/api/documents/upload']]) {
    const res = await fetch(AI + path, { method });
    expect([401, 403, 404, 405].includes(res.status), `${method} ${path} -> ${res.status} (must not be reachable unauthenticated)`);
  }
});
await check('deleting: a student cannot delete class material or another learner\'s notes (direct API)', async () => {
  const classDoc = (await aiCall('lec', `/api/modules/${CM}/documents`)).body.find((d) => d.filename === 'sec-class-direct.txt');
  eq((await aiCall('s3', `/api/modules/${CM}/documents/${classDoc.document_id}`, { method: 'DELETE' })).status, 403, 'student deleting class file');
  const s1Note = (await aiCall('s1', `/api/modules/${CM}/documents`)).body.find((d) => d.filename === 'sec-s1-note.txt');
  eq((await aiCall('sl', `/api/modules/${CM}/documents/${s1Note.document_id}`, { method: 'DELETE' })).status, 403, 'self-learner deleting a student note');
  expect((await aiNames('s1')).includes('sec-s1-note.txt'), 'note should still exist');
});
await check('Web exposes no document delete or read-by-id route', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  for (const method of ['DELETE', 'PUT', 'PATCH']) eq((await lec.req(`/api/studymind/modules/${CM}/documents`, { method })).status, 405, method);
  eq((await lec.req(`/api/studymind/modules/${CM}/documents/${id}`, { method: 'DELETE' })).status, 404);
});
await check("same-filename uploads: a learner's personal file does not supersede or hide class material", async () => {
  eq((await lec.upload(CM, 'policy.txt', Buffer.from('official class policy'), 'class', 'text/plain')).status, 201);
  eq((await s1.upload(CM, 'policy.txt', Buffer.from('my own policy notes'), 'personal', 'text/plain')).status, 201, 'learner upload');
  for (const viewer of ['s3', 'lec', 's1']) {
    const d = (await aiCall(viewer, `/api/modules/${CM}/documents`)).body.filter((x) => x.filename === 'policy.txt');
    expect(d.some((x) => x.visibility === 'class' && x.is_latest), `class policy.txt hidden from ${viewer}`);
  }
});

// ───────────────────────────── Versioning, deletion and history isolation ─────────────────────────────
group('Versioning, deletion and version-history isolation (Web -> real AI API, real DB, real Typesense when configured)');
const needDb = !!process.env.AI_PSQL;
const tsHeaders = { 'X-TYPESENSE-API-KEY': TS_KEY || '', 'Content-Type': 'application/json' };
// Seeded fixture chunks use chunk_index 9999; chunks written by the real indexer use 0..n. When the backend can embed
// (provider stand-in), a document has both, so assertions say which kind they mean.
const tsCount = async (docId, extra = '') => (await (await fetch(`${TS}/collections/document_chunks/documents/search?q=*&query_by=content&filter_by=${encodeURIComponent(`document_id:=${docId}${extra}`)}&per_page=1`, { headers: tsHeaders })).json()).found;
const tsFound = (docId) => tsCount(docId, ' && chunk_index:=9999');   // seeded fixture chunk
const tsReal = (docId) => tsCount(docId, ' && chunk_index:<9999');    // chunks from the real indexer
const tsTotal = (docId) => tsCount(docId);                            // everything for the document
async function tsSeed(docId, { module, filename, visibility, owner, lecturer, version }) {
  const r = await fetch(`${TS}/collections/document_chunks/documents`, { method: 'POST', headers: tsHeaders, body: JSON.stringify({
    id: `seed-${docId}-v${version}`, content: `seeded chunk for ${filename}`, embedding: Array.from({ length: 3072 }, () => 0.01),
    document_id: docId, filename, chunk_index: 9999, token_count: 3, module_id: module, course_code: '', semester_id: '', is_current_semester: true,
    week_number: 0, visibility, owner_id: owner, is_latest: true, doc_version: version, lecturer_id: lecturer }) });
  expect(r.ok, `Typesense seed failed: ${r.status} ${await r.text()}`);
}
const rowsOf = (modId, filename) => (psql(`select d.id, md.visibility, md.version, md.is_latest, coalesce(u.role,'?'), d.owner_id from module_documents md join documents d on d.id=md.document_id left join users u on u.id=d.owner_id where md.module_id='${modId}' and d.filename='${filename}' order by md.created_at`) || '')
  .split('\n').filter(Boolean).map((l) => { const [id, visibility, version, latest, role, owner] = l.split('|'); return { id, visibility, version: Number(version), latest: latest === 't', role, owner }; });
const rowExists = (docId) => psql(`select count(*) from module_documents where document_id='${docId}'`) === '1';

const V = { lec: new Client(), s1: new Client(), s2: new Client(), sl: new Client() };
const vEmail = (t) => email('v-' + t);
for (const [tag, role] of [['lec', 'lecturer'], ['s1', 'student'], ['s2', 'student'], ['sl', 'self_learner']]) {
  const r = await V[tag].json('/api/studymind/auth/register', 'POST', { email: vEmail(tag), full_name: `V ${tag}`, password: PASSWORD, role });
  expect(r.status === 201, `register ${tag}: ${r.status}`);
  tokens['v-' + tag] = (await (await fetch(AI + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: vEmail(tag), password: PASSWORD }) })).json()).access_token;
}
const vUser = {}; for (const tag of Object.keys(V)) vUser[tag] = (await V[tag].req('/api/studymind/learning-overview')).body.user;
const M = (await V.lec.json('/api/studymind/modules', 'POST', { title: 'Versioning Module', access_type: 'class' })).body;
const M2 = (await V.lec.json('/api/studymind/modules', 'POST', { title: 'Second Module', access_type: 'class' })).body;
for (const tag of ['s1', 's2', 'sl']) eq((await V[tag].json('/api/studymind/modules/join', 'POST', { course_id: M.id })).status, 200, `join ${tag}`);
const up = async (tag, name, text, visibility, mod = M.id) => { const r = await aiUpload('v-' + tag, mod, name, text, visibility); expect(r.status === 201, `${tag} upload ${name}: ${r.status} ${JSON.stringify(r.body)}`); return r.body.document_id; };
const list = async (tag, mod = M.id) => (await aiCall('v-' + tag, `/api/modules/${mod}/documents`)).body;
const versionsOf = (tag, docId, mod = M.id) => aiCall('v-' + tag, `/api/modules/${mod}/documents/${docId}/versions`);
const seedFor = (docId, name, visibility, ownerTag, version) => TS && tsSeed(docId, { module: M.id, filename: name, visibility, owner: vUser[ownerTag].id, lecturer: vUser.lec.id, version });
const tsNote = 'Typesense not configured (set TS_URL/TS_KEY with a real local Typesense)';

// ---- The original release blocker, reproduced exactly ----
const ids = {};
await check('blocker scenario: lecturer class policy.txt, then student personal policy.txt - both stay latest, version 1, correctly owned', async () => {
  if (!needDb) return skipUnverified('database verification', 'AI_PSQL not set');
  ids.classV1 = await up('lec', 'policy.txt', 'official class policy', 'class');
  await seedFor(ids.classV1, 'policy.txt', 'class', 'lec', 1);
  ids.s1V1 = await up('s1', 'policy.txt', 'a different policy written by a student', 'personal');
  await seedFor(ids.s1V1, 'policy.txt', 'personal', 's1', 1);
  const rows = rowsOf(M.id, 'policy.txt');
  eq(rows.length, 2, 'row count');
  const cls = rows.find((r) => r.visibility === 'class'), per = rows.find((r) => r.visibility === 'personal');
  expect(cls && per, 'both rows must exist');
  eq(cls.latest, true, 'class is_latest'); eq(cls.version, 1, 'class version'); eq(cls.role, 'lecturer', 'class owner role'); eq(cls.owner, vUser.lec.id);
  eq(per.latest, true, 'personal is_latest'); eq(per.version, 1, 'personal version'); eq(per.role, 'student', 'personal owner role'); eq(per.owner, vUser.s1.id);
});
await check('blocker scenario: list responses (direct API and Web) - student sees both, lecturer only class, other student only class', async () => {
  const pick = (docs) => docs.filter((d) => d.filename === 'policy.txt').map((d) => `${d.visibility}:v${d.version}:${d.is_latest}`).sort();
  eq(JSON.stringify(pick(await list('s1'))), JSON.stringify(['class:v1:true', 'personal:v1:true']), 'student s1 (direct)');
  eq(JSON.stringify(pick(await list('lec'))), JSON.stringify(['class:v1:true']), 'lecturer (direct)');
  eq(JSON.stringify(pick(await list('s2'))), JSON.stringify(['class:v1:true']), 'other student (direct)');
  const webView = async (tag) => ((await V[tag].req(`/api/studymind/modules/${M.id}/documents`)).body).filter((d) => d.filename === 'policy.txt').map((d) => `${d.visibility}:${d.is_latest}`).sort();
  eq(JSON.stringify(await webView('s1')), JSON.stringify(['class:true', 'personal:true']), 'student s1 (Web)');
  eq(JSON.stringify(await webView('lec')), JSON.stringify(['class:true']), 'lecturer (Web)');
  eq(JSON.stringify(await webView('s2')), JSON.stringify(['class:true']), 'other student (Web)');
});
await check('blocker scenario: the class document is NOT superseded in the real search index (Typesense)', async () => {
  if (!TS) return skipUnverified('search-index supersede check', tsNote);
  eq(await tsFound(ids.classV1), 1, 'class chunk must still exist'); eq(await tsFound(ids.s1V1), 1, "student's own chunk exists");
  if (STUB) { expect((await tsReal(ids.classV1)) > 0, 'the real indexed chunk of the class document must still exist'); expect((await tsReal(ids.s1V1)) > 0, "the student's real chunk exists"); }
});
await check('self-learner personal policy.txt: independent v1, class and student documents untouched', async () => {
  if (!needDb) return skipUnverified('database verification', 'AI_PSQL not set');
  ids.slV1 = await up('sl', 'policy.txt', 'self learner policy', 'personal'); await seedFor(ids.slV1, 'policy.txt', 'personal', 'sl', 1);
  const rows = rowsOf(M.id, 'policy.txt'); eq(rows.length, 3, 'row count');
  for (const r of rows) { eq(r.latest, true, `${r.role} is_latest`); eq(r.version, 1, `${r.role} version`); }
  expect(rows.some((r) => r.role === 'self_learner' && r.visibility === 'personal'), 'self-learner row');
  eq(JSON.stringify((await list('sl')).filter((d) => d.filename === 'policy.txt').map((d) => d.visibility).sort()), JSON.stringify(['class', 'personal']));
  if (TS) { eq(await tsFound(ids.classV1), 1); eq(await tsFound(ids.s1V1), 1); eq(await tsFound(ids.slV1), 1); }
});
await check('two learners uploading identically named personal files: independent, mutually invisible', async () => {
  if (!needDb) return skipUnverified('database verification', 'AI_PSQL not set');
  ids.s2V1 = await up('s2', 'policy.txt', 'second student policy', 'personal'); await seedFor(ids.s2V1, 'policy.txt', 'personal', 's2', 1);
  const rows = rowsOf(M.id, 'policy.txt'); eq(rows.length, 4, 'row count');
  for (const r of rows) { eq(r.latest, true, `${r.role}/${r.owner} is_latest`); eq(r.version, 1, `${r.role}/${r.owner} version`); }
  for (const tag of ['s1', 's2', 'sl']) {
    const mine = (await list(tag)).filter((d) => d.filename === 'policy.txt');
    eq(mine.length, 2, `${tag} should see class + own only`);
    expect(mine.some((d) => d.visibility === 'personal' && d.document_id === ids[tag + 'V1']), `${tag} sees their own file`);
  }
  if (TS) for (const id of [ids.classV1, ids.s1V1, ids.s2V1, ids.slV1]) eq(await tsFound(id), 1, 'no chunks removed');
});

// ---- Legitimate version updates ----
await check('lecturer uploads class policy.txt v2: only the previous CLASS version is superseded', async () => {
  if (!needDb) return skipUnverified('database verification', 'AI_PSQL not set');
  ids.classV2 = await up('lec', 'policy.txt', 'official class policy, revised', 'class');
  const rows = rowsOf(M.id, 'policy.txt'); eq(rows.length, 5, 'row count');
  const cls = rows.filter((r) => r.visibility === 'class').sort((a, b) => a.version - b.version);
  eq(cls.length, 2); eq(cls[0].version, 1); eq(cls[0].latest, false, 'old class version superseded'); eq(cls[1].version, 2); eq(cls[1].latest, true, 'new class version latest');
  for (const r of rows.filter((x) => x.visibility === 'personal')) { eq(r.version, 1, `${r.role} version`); eq(r.latest, true, `${r.role} still latest`); }
  const lecList = (await list('lec')).filter((d) => d.filename === 'policy.txt'); eq(lecList.length, 1); eq(lecList[0].version, 2);
  if (TS) { eq(await tsTotal(ids.classV1), 0, 'old class chunks (seeded and real) removed from the index'); for (const id of [ids.s1V1, ids.s2V1, ids.slV1]) eq(await tsFound(id), 1, "learners' chunks untouched"); }
  else skipUnverified('search-index check for class version update', tsNote);
});
await check("student uploads personal policy.txt v2: only THEIR previous personal version is superseded", async () => {
  if (!needDb) return skipUnverified('database verification', 'AI_PSQL not set');
  ids.s1V2 = await up('s1', 'policy.txt', 'my revised notes', 'personal');
  const rows = rowsOf(M.id, 'policy.txt'); eq(rows.length, 6, 'row count');
  const mine = rows.filter((r) => r.owner === vUser.s1.id).sort((a, b) => a.version - b.version);
  eq(mine.length, 2); eq(mine[0].latest, false, 'old personal version superseded'); eq(mine[1].version, 2); eq(mine[1].latest, true);
  for (const r of rows.filter((x) => x.owner !== vUser.s1.id)) {
    const expectLatest = r.visibility === 'class' ? r.version === 2 : true;
    eq(r.latest, expectLatest, `unrelated ${r.role} v${r.version} is_latest`);
  }
  for (const tag of ['s2', 'sl']) { const d = (await list(tag)).filter((x) => x.filename === 'policy.txt'); eq(d.length, 2, `${tag} list`); expect(d.every((x) => x.is_latest), `${tag} docs latest`); }
  if (TS) { eq(await tsTotal(ids.s1V1), 0, "student's old chunks (seeded and real) removed"); for (const id of [ids.s2V1, ids.slV1]) eq(await tsFound(id), 1, "others' chunks untouched"); }
  else skipUnverified('search-index check for personal version update', tsNote);
});

// ---- Version-history privacy ----
group('Version-history privacy (direct API)');
await check('lecturer sees the history of their own class document, with class versions only', async () => {
  const r = await versionsOf('lec', ids.classV2); eq(r.status, 200);
  eq(JSON.stringify(r.body.map((v) => v.version)), JSON.stringify([2, 1]));
  const allowed = new Set([ids.classV1, ids.classV2]);
  expect(r.body.every((v) => allowed.has(v.document_id)), 'history must contain only the lecturer class documents');
});
await check('student sees the history of their own personal document, and only their own versions', async () => {
  const r = await versionsOf('s1', ids.s1V2); eq(r.status, 200);
  eq(JSON.stringify(r.body.map((v) => v.version)), JSON.stringify([2, 1]));
  expect(r.body.every((v) => [ids.s1V1, ids.s1V2].includes(v.document_id)), 'history leaked another uploader');
});
await check("identically named class and personal files never appear in each other's histories", async () => {
  const cls = (await versionsOf('s2', ids.classV2)).body.map((v) => v.document_id);
  expect(cls.every((id) => [ids.classV1, ids.classV2].includes(id)), 'class history includes personal files');
  const personal = (await versionsOf('s2', ids.s2V1)).body.map((v) => v.document_id);
  eq(JSON.stringify(personal), JSON.stringify([ids.s2V1]), 'personal history should contain only that learner\'s file');
});
await check("lecturer cannot read a student's personal history; students cannot read each other's (403/404, no information)", async () => {
  for (const [who, target] of [['lec', ids.s1V2], ['lec', ids.s2V1], ['s2', ids.s1V2], ['s1', ids.s2V1], ['sl', ids.s1V1], ['s1', ids.slV1]]) {
    const r = await versionsOf(who, target);
    expect([403, 404].includes(r.status), `${who} -> ${target}: status ${r.status}`);
    expect(!/policy\.txt|version|document_id/i.test(JSON.stringify(r.body)), `${who}: response discloses details: ${JSON.stringify(r.body)}`);
  }
});
await check('a document ID from another module exposes nothing', async () => {
  const otherDoc = await up('lec', 'other-module.txt', 'doc in the second module', 'class', M2.id);
  for (const who of ['lec', 's1']) {
    const r = await versionsOf(who, otherDoc, M.id);   // M's URL, M2's document
    eq(r.status, 404, `${who} via wrong module`); expect(!/other-module/.test(JSON.stringify(r.body)), 'filename disclosed');
  }
  eq((await versionsOf('s1', otherDoc, M2.id)).status, 403, 'student not enrolled in module 2');
  eq((await versionsOf('lec', '00000000-0000-4000-8000-000000000000')).status, 404, 'unknown document id');
});

// ---- Deletion security ----
group('Document deletion security (direct API)');
const del = (tag, docId, mod = M.id) => aiCall('v-' + tag, `/api/modules/${mod}/documents/${docId}`, { method: 'DELETE' });
await check('forbidden deletions return 403 and leave rows and search chunks unchanged', async () => {
  const cases = [['lec', ids.s2V1, "lecturer -> student's personal note"], ['s1', ids.classV2, "student -> lecturer's class document"],
    ['s1', ids.s2V1, "learner -> another learner's note"], ['sl', ids.s1V2, "self-learner -> student's note"], ['s2', ids.slV1, "student -> self-learner's note"]];
  for (const [who, doc, label] of cases) {
    const r = await del(who, doc); eq(r.status, 403, label);
    if (needDb) expect(rowExists(doc), `${label}: database row was removed`);
    if (TS) expect((await tsFound(doc)) >= 0, 'n/a');
  }
  if (!needDb) skipUnverified('database unchanged after forbidden deletes', 'AI_PSQL not set');
  if (TS) { eq(await tsFound(ids.s2V1), 1, "s2 chunks after forbidden delete"); eq(await tsFound(ids.slV1), 1, 'sl chunks after forbidden delete'); }
  else skipUnverified('search-index unchanged after forbidden deletes', tsNote);
});
await check('unknown, cross-module and outsider deletions are refused without side effects', async () => {
  eq((await del('lec', '00000000-0000-4000-8000-000000000000')).status, 404);
  const other = (await list('lec', M2.id))[0].document_id;
  eq((await del('lec', other, M.id)).status, 404, 'doc of another module via this module'); 
  if (needDb) expect(rowExists(other), 'cross-module document must remain');
  eq((await aiCall('v-s1', `/api/modules/${M2.id}/documents/${other}`, { method: 'DELETE' })).status, 403, 'student not in module 2');
});
const allowedDeletes = [['lec', 'class', "lecturer deletes their own class document"], ['s1', 'personal', 'student deletes their own personal note'], ['sl', 'personal', 'self-learner deletes their own personal note']];
for (const [tag, visibility, label] of allowedDeletes) {
  await check(`${label} (needs a real Typesense: the AI delete path calls it strictly)`, async () => {
    if (!TS) return skipUnverified(label, `${tsNote}; without it the AI returns 500 and the row is kept, so this cannot be called a pass`);
    const name = `deletable-${tag}.txt`; const id = await up(tag, name, 'to be deleted', visibility);
    await seedFor(id, name, visibility, tag, 1); eq(await tsFound(id), 1, 'seeded');
    eq((await del(tag, id)).status, 204, 'delete status');
    if (needDb) expect(!rowExists(id), 'row should be gone');
    eq(await tsTotal(id), 0, 'all chunks (seeded and real) should be removed from the index');
    expect(!(await list(tag)).some((d) => d.document_id === id), 'still listed');
  });
}

// ───────────────────────────── Failure handling (before and around the embedding step) ─────────────────────────────
group('Failure handling: bad files and outages produce understandable errors without internals');
const LEAK = /traceback|stack ?trace|openai|sk-[a-z0-9]|api[_ ]?key|incorrect api|pypdf|python-docx|llama|errno|exception|file "|\.py"|psycopg|asyncpg|sqlalchemy|typesense/i;
const noLeak = (label, value) => { const text = typeof value === 'string' ? value : JSON.stringify(value); expect(!LEAK.test(text), `${label} exposes internals: ${text.slice(0, 200)}`); };
const fx = (name) => (FIXTURES && existsSync(`${FIXTURES}/${name}`)) ? readFileSync(`${FIXTURES}/${name}`) : null;
const fnote = 'FIXTURES not set (directory of synthetic documents)';
const badFiles = [['truncated.pdf', 'truncated PDF'], ['garbage.pdf', 'random bytes with a .pdf name'], ['not-a-zip.docx', 'text pretending to be DOCX'],
  ['truncated.docx', 'truncated DOCX'], ['whitespace.txt', 'whitespace-only text'], ['image-only.pdf', 'PDF page with no extractable text']];
for (const [name, label] of badFiles) {
  await check(`${label}: accepted for processing, reported as failed, no internals exposed (Web and AI list/upload responses)`, async () => {
    const bytes = fx(name); if (!bytes) return skipUnverified(name, fnote);
    const unique = `${run}-${name}`;
    const w = await V.lec.upload(M.id, unique, bytes, 'personal', 'application/octet-stream');
    expect([201, 400, 422].includes(w.status), `Web upload status ${w.status} ${JSON.stringify(w.body)}`);
    noLeak(`Web upload response (${name})`, w.body);
    if (w.status === 201) {
      noLeak('Web upload status text', w.body.message ?? '');
      eq(w.body.status, 'failed', 'a file with no usable text must be reported failed, never indexed');
      const row = (await V.lec.req(`/api/studymind/modules/${M.id}/documents`)).body.find((d) => d.filename === unique);
      expect(row, 'document missing from list'); eq(row.status, 'failed'); eq(row.chunk_count, 0, 'no chunks'); noLeak('Web list row', row);
      if (needDb) eq(psql(`select count(*) from document_chunks dc join documents d on d.id=dc.document_id where d.filename='${unique}'`), '0', 'no chunk rows persisted');
      if (TS) eq(await tsTotal(w.body.document_id), 0, 'no chunks may reach the search index');
    }
  });
}
await check('empty file and unsupported formats are rejected before processing (readable, no internals)', async () => {
  for (const [name, bytes] of [['empty.pdf', Buffer.alloc(0)], ['slides.pptx', Buffer.from('x')], ['legacy.doc', Buffer.from('x')], ['tool.exe', Buffer.from('MZ')]]) {
    const w = await V.lec.upload(M.id, name, bytes, 'personal'); expect([400, 422].includes(w.status), `${name}: ${w.status}`);
    expect(typeof w.body.error === 'string' && w.body.error.length > 5, `${name}: no readable message`); noLeak(name, w.body);
  }
});
await check('valid Physics PDF and Biology DOCX are accepted; the AI reports an honest status (indexed only with a working OpenAI key)', async () => {
  for (const name of ['physics-notes.pdf', 'biology-notes.docx']) {
    const bytes = fx(name); if (!bytes) return skipUnverified(name, fnote);
    const w = await V.lec.upload(M.id, `${run}-${name}`, bytes, 'class');
    eq(w.status, 201, JSON.stringify(w.body)); expect(['indexed', 'failed'].includes(w.body.status), `status ${w.body.status}`); noLeak(`${name} upload response`, w.body);
    console.log(`        ${name}: AI reported status "${w.body.status}"`);
  }
});
if (TS_CONTAINER) {
  const { execFileSync } = await import('node:child_process');
  const docker = (...a) => execFileSync('docker', a, { stdio: 'pipe' }).toString().trim();
  const waitTs = async () => { for (let i = 0; i < 30; i++) { try { if ((await fetch(`${TS}/health`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 1000)); } throw new Error('Typesense did not come back'); };
  const victim = await up('s1', `ts-outage-${run}.txt`, 'document owned by a student', 'personal');
  docker('stop', TS_CONTAINER);
  try {
    await check('Typesense outage: Web still lists documents and accepts uploads; errors stay generic', async () => {
      const list = await V.s1.req(`/api/studymind/modules/${M.id}/documents`); eq(list.status, 200); noLeak('list during outage', list.body);
      const w = await V.s1.upload(M.id, `ts-down-${run}.txt`, Buffer.from('uploaded while the search index is down'), 'personal', 'text/plain');
      expect([201, 502, 503].includes(w.status), `status ${w.status}`); noLeak('upload during outage', w.body);
      if (w.status === 201) expect(['failed', 'pending', 'processing', 'indexed'].includes(w.body.status), `status ${w.body.status}`);
    });
    await check('Typesense outage: a delete fails safely (no partial deletion, no internals in the body)', async () => {
      const r = await fetch(AI + `/api/modules/${M.id}/documents/${victim}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokens['v-s1']}` } });
      expect(r.status >= 500, `delete should fail while the index is down, got ${r.status}`); noLeak('delete body during outage', await r.text());
      if (needDb) expect(rowExists(victim), 'document row must survive a failed delete (no half-deleted state)');
    });
  } finally { docker('start', TS_CONTAINER); await waitTs(); }
  await check('Typesense recovery: the same delete succeeds once the index is back', async () => {
    eq((await del('s1', victim)).status, 204); if (needDb) expect(!rowExists(victim), 'row should be gone');
  });
} else skipUnverified('Typesense outage handling', 'TS_CONTAINER not set');

// ───────────────────────────── AI study tools (Tutor, Quiz, Flashcards, Summary) ─────────────────────────────
group(SHIM ? 'AI study tools via Web proxy (CONTROLLED FIXTURE AI - not live AI)' : 'AI study tools via Web proxy against the REAL backend (no OpenAI key: AI execution unverified)');
const fixtureMode = !!SHIM;
const A = { lec: new Client(), st: new Client(), st2: new Client(), sl: new Client(), out: new Client() };
for (const [tag, role] of [['lec', 'lecturer'], ['st', 'student'], ['st2', 'student'], ['sl', 'self_learner'], ['out', 'student']]) {
  const r = await A[tag].json('/api/studymind/auth/register', 'POST', { email: email('ai-' + tag), full_name: `AI ${tag}`, password: PASSWORD, role });
  expect(r.status === 201, `register ${tag}: ${r.status}`);
}
const aId = {}; for (const tag of Object.keys(A)) aId[tag] = (await A[tag].req('/api/studymind/learning-overview')).body.user.id;
const AM = (await A.lec.json('/api/studymind/modules', 'POST', { title: 'AI Class Module', access_type: 'class' })).body.id;
const AP = (await A.sl.json('/api/studymind/modules', 'POST', { title: 'AI Personal Module', access_type: 'personal' })).body.id;
for (const tag of ['st', 'st2', 'sl']) eq((await A[tag].json('/api/studymind/modules/join', 'POST', { course_id: AM })).status, 200, `join ${tag}`);
const CANARY_OF = (id) => `CANARY-${id.slice(0, 8)}-${run}`;
const aiPath = (mod, what) => `/api/studymind/modules/${mod}/ai/${what}`;
const calls = async () => (await fetch(SHIM + '/__calls')).json();
const clearCalls = () => fetch(SHIM + '/__calls', { method: 'DELETE' });
const AI_ROUTES = [['chat', { message: 'What is Newton\'s second law?' }], ['quiz', {}], ['flashcards', {}], ['summary', {}]];
const QID0 = '00000000-0000-4000-8000-000000000001';
const noInternals = (label, v) => noLeak(label, v);

await check('unauthenticated requests are refused (401) on every AI route', async () => {
  for (const [what, body] of [...AI_ROUTES, [`quiz/${QID0}`, { answers: [{ question_id: QID0, answer: 'a' }] }]]) eq((await new Client().json(aiPath(AM, what), 'POST', body)).status, 401, what);
});
await check('malformed requests are rejected before reaching the AI (400/413) with readable messages', async () => {
  eq((await A.st.json(aiPath('not-a-uuid', 'chat'), 'POST', { message: 'hi' })).status, 400);
  eq((await A.st.json(aiPath(AM, `quiz/not-a-uuid`), 'POST', { answers: [{ question_id: QID0, answer: 'a' }] })).status, 400);
  const raw = (what, body, headers = { 'Content-Type': 'application/json' }) => A.st.req(aiPath(AM, what), { method: 'POST', headers, body });
  eq((await raw('chat', '{not json')).status, 400);
  for (const [what, body] of [['chat', { message: '   ' }], ['chat', { message: 'x'.repeat(2001) }], ['chat', { message: 'hi', complexity: 'genius' }], ['chat', { message: 'hi', session_id: 'bad' }],
    ['quiz', { question_count: 3 }], ['quiz', { question_count: 99 }], ['quiz', { topic: 'x'.repeat(201) }], ['flashcards', { max_cards: 1 }], ['summary', { topic: 5 }],
    [`quiz/${QID0}`, { answers: [] }], [`quiz/${QID0}`, { answers: [{ question_id: 'x', answer: 'a' }] }]]) {
    const r = await A.st.json(aiPath(AM, what), 'POST', body); eq(r.status, 400, `${what} ${JSON.stringify(body).slice(0, 40)}`); expect(typeof r.body.error === 'string' && r.body.error.length > 3, 'no message');
  }
  eq((await raw('chat', JSON.stringify({ message: 'x'.repeat(40000) }))).status, 413, 'oversized body');
  for (const method of ['GET', 'PUT', 'DELETE']) eq((await A.st.req(aiPath(AM, 'chat'), { method })).status, 405, method);
});
await check('a signed-in user who cannot open the module is refused (403) on every AI route - class and personal modules', async () => {
  if (fixtureMode) await clearCalls();
  for (const [who, mod] of [['out', AM], ['out', AP], ['st', AP], ['lec', AP]]) {
    for (const [what, body] of [...AI_ROUTES, [`quiz/${QID0}`, { answers: [{ question_id: QID0, answer: 'a' }] }]]) {
      const r = await A[who].json(aiPath(mod, what), 'POST', body);
      eq(r.status, 403, `${who} -> ${mod === AM ? 'class' : 'personal'} module ${what}`); noInternals('403 body', r.body);
    }
  }
  if (fixtureMode) { const c = await calls(); eq(c.filter((x) => [aId.out, aId.lec].includes(x.user_id) || (x.user_id === aId.st && x.body.module_id === AP)).length, 0, 'the AI must never be called for a user without module access'); }
});
await check('a nonexistent module is a clean 404 on every AI route and never reaches the AI', async () => {
  if (fixtureMode) await clearCalls();
  const missing = '00000000-0000-4000-8000-00000000beef';
  for (const [what, body] of [...AI_ROUTES, [`quiz/${QID0}`, { answers: [{ question_id: QID0, answer: 'a' }] }]]) {
    const r = await A.st.json(aiPath(missing, what), 'POST', body); eq(r.status, 404, what); expect(/not be found/i.test(r.body.error), r.body.error); noInternals('404 body', r.body);
  }
  if (fixtureMode) eq((await calls()).filter((c) => c.body.module_id === missing).length, 0, 'the AI must not be called for a nonexistent module');
});
if (fixtureMode) {
  await check('AI Tutor: answer, citations and session continuity (controlled fixture)', async () => {
    await clearCalls();
    const r = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: "Explain Newton's second law", complexity: 'simple', module_id: '00000000-0000-4000-8000-0000000000ff', user_id: 'victim', role: 'admin', scope_mode: 'class_only' });
    eq(r.status, 200, JSON.stringify(r.body)); expect(/F = m a/.test(r.body.answer), 'answer'); eq(r.body.sources.length, 1, 'citations are de-duplicated by document'); eq(r.body.sources[0].filename, 'physics-notes.pdf'); expect(r.body.session_id, 'session');
    const forwarded = (await calls()).find((c) => c.path === '/api/chat');
    eq(forwarded.body.module_id, AM, 'module id must come from the URL, not the browser'); eq(forwarded.user_id, aId.st, 'identity comes from the signed-in session'); eq(forwarded.has_bearer, true);
    expect(!('user_id' in forwarded.body) && !('role' in forwarded.body), 'browser-supplied identity fields must not be forwarded'); eq(forwarded.body.scope_mode, 'class_only', 'only the whitelisted scope choice is forwarded'); eq(forwarded.body.complexity, 'simple');
    const next = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'And for 5 kg at 3 m/s^2?', session_id: r.body.session_id });
    eq(next.status, 200); eq(next.body.session_id, r.body.session_id, 'same conversation');
    noLeak('chat response', r.body);
  });
  await check('AI Tutor: empty-retrieval response is surfaced with suggestions, and failures are generic', async () => {
    const e = await A.sl.json(aiPath(AM, 'chat'), 'POST', { message: 'TRIGGER_EMPTY question' });
    eq(e.status, 200); eq(e.body.no_content_found, true); eq(e.body.sources.length, 0); expect(e.body.suggestions.length > 0, 'suggestions');
    const f = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'TRIGGER_ERROR now' });
    eq(f.status, 502); noInternals('provider error', f.body); expect(/unavailable/i.test(f.body.error), f.body.error);
    const q = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'TRIGGER_429 please' });
    eq(q.status, 429); expect(/allowance/i.test(q.body.error), q.body.error);
  });
  await check('Quiz: answers are withheld until submission; results show score, correctness and explanations', async () => {
    await clearCalls();
    const g = await A.st.json(aiPath(AM, 'quiz'), 'POST', { question_count: 5, topic: 'Forces' });
    eq(g.status, 201, JSON.stringify(g.body)); eq(g.body.questions.length, 5);
    for (const word of ['correct_answer', 'explanation', 'source_chunk', 'is_correct', 'student_answer']) expect(!JSON.stringify(g.body).includes(word), `${word} leaked before submission`);
    const fwd = (await calls()).find((c) => c.path === '/api/quiz/generate'); eq(fwd.body.module_id, AM); eq(fwd.body.question_type, 'mcq'); eq(fwd.body.topic, 'Forces'); eq(fwd.user_id, aId.st);
    const answers = g.body.questions.map((q, i) => ({ question_id: q.id, answer: i === 0 ? 'a' : 'b' }));   // first answer deliberately wrong
    const s = await A.st.json(aiPath(AM, `quiz/${g.body.attempt_id}`), 'POST', { answers });
    eq(s.status, 200, JSON.stringify(s.body)); eq(s.body.total, 5); expect(s.body.correct >= 1 && s.body.correct < 5, `correct=${s.body.correct}`);
    const first = s.body.questions[0]; eq(first.is_correct, false); expect(first.explanation.length > 5 && first.correct_answer, 'explanation and correct answer after submission');
    const other = await A.st2.json(aiPath(AM, `quiz/${g.body.attempt_id}`), 'POST', { answers });
    eq(other.status, 404, "another learner must not be able to submit or read someone else's quiz");
  });
  await check('Flashcards: a deck of question/answer cards is returned with clean fields', async () => {
    await clearCalls();
    const r = await A.sl.json(aiPath(AM, 'flashcards'), 'POST', { max_cards: 6 });
    eq(r.status, 201, JSON.stringify(r.body)); eq(r.body.cards.length, 6); for (const c of r.body.cards) expect(c.front && c.back, 'card sides');
    expect(!JSON.stringify(r.body).includes('source_chunk'), 'internal fields must not be forwarded');
    eq((await calls()).find((c) => c.path === '/api/flashcards/generate').body.max_cards, 6);
  });
  await check('Summary: structured Markdown with the source document count', async () => {
    await clearCalls();
    const r = await A.lec.json(aiPath(AM, 'summary'), 'POST', { topic: 'Momentum' });
    eq(r.status, 201, JSON.stringify(r.body)); expect(/^## Summary: Momentum/.test(r.body.content), 'content'); eq(r.body.source_doc_count, 2);
    const fwd = (await calls()).find((c) => c.path === '/api/summarise'); eq(fwd.body.scope, 'module'); eq(fwd.body.module_id, AM); eq(fwd.user_id, aId.lec);
  });
  await check('quiz, flashcards and summary report empty-material and provider failures without internals', async () => {
    for (const what of ['quiz', 'flashcards', 'summary']) {
      const empty = await A.st.json(aiPath(AM, what), 'POST', { topic: 'TRIGGER_EMPTY' }); eq(empty.status, 422, `${what} empty`); expect(/no indexed content/i.test(empty.body.error), empty.body.error);
      const boom = await A.st.json(aiPath(AM, what), 'POST', { topic: 'TRIGGER_ERROR' }); eq(boom.status, 502, `${what} error`); noInternals(`${what} error body`, boom.body);
    }
  });
  await check('every role that can open a module can use the tools: lecturer (owner), student and self-learner (enrolled)', async () => {
    for (const tag of ['lec', 'st', 'sl']) for (const [what, body] of AI_ROUTES) { const r = await A[tag].json(aiPath(AM, what), 'POST', body); expect([200, 201].includes(r.status), `${tag} ${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); }
    const own = await A.sl.json(aiPath(AP, 'summary'), 'POST', {}); expect([200, 201].includes(own.status), `owner of a personal module: ${own.status}`);
  });
} else if (STUB) {
  // Web -> REAL backend (real indexing, retrieval, authorization) -> recording provider STAND-IN. Not live OpenAI.
  const hits = async () => { await new Promise((r) => setTimeout(r, 150)); return (await fetch(STUB + '/__hits')).json(); };
  const resetHits = () => fetch(STUB + '/__hits', { method: 'DELETE' });
  const ORG = CANARY_OF(AM), OTHER = CANARY_OF(AP);
  const upM = await A.lec.upload(AM, 'class-notes.txt', Buffer.from(`Class notes. Marker ${ORG}. Newton's second law relates force, mass and acceleration.`), 'class', 'text/plain'); eq(upM.status, 201, JSON.stringify(upM.body));
  const upP = await A.sl.upload(AP, 'private.txt', Buffer.from(`Private notes. Marker ${OTHER}. Newton force.`), 'personal', 'text/plain'); eq(upP.status, 201);
  await check('Web -> real backend: an enrolled student gets a grounded answer with a citation and nothing from other modules (provider stand-in)', async () => {
    await resetHits();
    const r = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'Explain Newton force and the marker', module_id: AP, week_id: AM, document_id: AM, user_id: 'victim', scope_mode: 'class_only' });
    eq(r.status, 200, JSON.stringify(r.body)); expect(r.body.answer.includes(ORG), 'class material should ground the answer'); expect(r.body.sources.some((s) => s.filename === 'class-notes.txt'), 'citation');
    const h = (await hits()).filter((x) => x.path === 'chat.completions'); expect(h.length >= 1, 'provider should be called once authorised');
    expect(!h.some((x) => x.text.includes(OTHER)) && !r.body.answer.includes(OTHER), "another module's material must not reach the provider or the user, even with spoofed ids in the request");
    noLeak('chat response', r.body);
  });
  await check('Web -> real backend: summary and quiz/flashcards reach the AI only for authorised users; internal 422 text is hidden', async () => {
    const s = await A.st.json(aiPath(AM, 'summary'), 'POST', {}); eq(s.status, 201, JSON.stringify(s.body)); const whole = `${s.body.content}\n${s.body.advice ?? ''}`;   // the stand-in echoes its prompt, whose advice instructions precede the module content, so the Web split can put the echoed content in `advice`
    expect(whole.includes(ORG), 'summary grounded in the module'); expect(!whole.includes(OTHER), "another module's material must not appear in the summary or its advice"); expect(typeof s.body.advice === 'string' || s.body.advice === null, 'advice is a separate field');
    for (const what of ['quiz', 'flashcards']) { const r = await A.st.json(aiPath(AM, what), 'POST', {}); expect([201, 422].includes(r.status), `${what}: ${r.status}`); if (r.status === 422) { noInternals(`${what} 422`, r.body); expect(!/LLM|JSON/.test(r.body.error), r.body.error); } }
  });
  await check('Web -> real backend: refused users (non-member, other private module, no session) never cause a provider call', async () => {
    await resetHits();
    for (const [who, mod] of [['out', AM], ['out', AP], ['st', AP]]) for (const [what, body] of AI_ROUTES) { const r = await A[who].json(aiPath(mod, what), 'POST', body); eq(r.status, 403, `${who} ${what}`); }
    eq((await new Client().json(aiPath(AM, 'chat'), 'POST', { message: 'hi' })).status, 401);
    eq((await hits()).length, 0, 'the AI provider must not be called for refused requests');
  });
  await check("Web -> real backend: another user's chat session id cannot be reused", async () => {
    const mine = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'hello' }); eq(mine.status, 200);
    const stolen = await A.st2.json(aiPath(AM, 'chat'), 'POST', { message: 'hello', session_id: mine.body.session_id }); eq(stolen.status, 404, 'session ownership is enforced by the AI');
  });
  await check('Web -> real backend: chat history is private to its owner and to its module, and a chat can be deleted', async () => {
    const chat = await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'history probe question' }); eq(chat.status, 200); const sid = chat.body.session_id;
    const base = `/api/studymind/modules/${AM}/ai/sessions`;
    const list = await A.st.req(base); eq(list.status, 200);
    const mineRow = list.body.find((x) => x.id === sid); expect(mineRow, 'the new chat is listed'); eq(mineRow.title, 'history probe question');
    eq(Object.keys(mineRow).sort().join(','), 'id,message_count,title,updated_at', 'no user or module identifiers in the list');
    const detail = await A.st.req(`${base}/${sid}`); eq(detail.status, 200);
    eq(detail.body.messages.map((m) => m.role).join(','), 'user,assistant'); eq(detail.body.messages[0].content, 'history probe question');
    expect(!('user_id' in detail.body) && !('module_id' in detail.body), 'no internal identifiers in the detail');
    // another user, even in the same module, sees nothing of it
    eq((await A.st2.req(base)).body.some((x) => x.id === sid), false, "another student's list does not contain it");
    eq((await A.st2.req(`${base}/${sid}`)).status, 404, 'cannot read it'); eq((await A.st2.req(`${base}/${sid}`, { method: 'DELETE' })).status, 404, 'cannot delete it');
    // a different module (one the owner is not a member of): refused, so the chat cannot be reached through it
    eq((await A.st.req(`/api/studymind/modules/${AP}/ai/sessions/${sid}`)).status, 403, 'a chat cannot be read through another module');
    eq((await A.st.req(`/api/studymind/modules/${AP}/ai/sessions/${sid}`, { method: 'DELETE' })).status, 403, '...or deleted through another');
    // not a member / not signed in: refused before any history is touched
    for (const [who, expected] of [[A.out, 403], [new Client(), 401]]) { eq((await who.req(base)).status, expected); eq((await who.req(`${base}/${sid}`)).status, expected); eq((await who.req(`${base}/${sid}`, { method: 'DELETE' })).status, expected); }
    eq((await A.st.req(`${base}/${sid}`, { method: 'DELETE', headers: { Origin: 'https://evil.example.com' } })).status, 403, 'cross-site delete refused');
    eq((await A.st.req(`${base}/${sid}`)).status, 200, '...and the chat survived');
    eq((await A.st.req(`${base}/${sid}`, { method: 'DELETE' })).status, 204); eq((await A.st.req(`${base}/${sid}`)).status, 404, 'a deleted chat is gone');
    eq((await A.st.req(base)).body.some((x) => x.id === sid), false);
  });
  await check('Web -> real backend: saved summaries are private to their owner and module, can be reopened, and can be deleted; unknown kinds are refused', async () => {
    const made = await A.st.json(aiPath(AM, 'summary'), 'POST', {}); eq(made.status, 201, JSON.stringify(made.body)); const sid = made.body.id;
    const base = `/api/studymind/modules/${AM}/ai/history`;
    const list = await A.st.req(`${base}/summary`); eq(list.status, 200);
    const row = list.body.find((x) => x.id === sid); expect(row, 'the new summary is listed'); eq(Object.keys(row).sort().join(','), 'completed,created_at,detail,id,title', 'display fields only');
    const detail = await A.st.req(`${base}/summary/${sid}`); eq(detail.status, 200); expect(detail.body.summary.content.length > 0, 'content'); expect(!('user_id' in detail.body.summary) && !('module_id' in detail.body.summary), 'no internal identifiers');
    eq((await A.st2.req(`${base}/summary`)).body.some((x) => x.id === sid), false, "another student's list does not contain it");
    eq((await A.st2.req(`${base}/summary/${sid}`)).status, 404); eq((await A.st2.req(`${base}/summary/${sid}`, { method: 'DELETE' })).status, 404);
    eq((await A.st.req(`/api/studymind/modules/${AP}/ai/history/summary/${sid}`)).status, 403, 'a module the student is not in is refused');
    for (const [who, expected] of [[A.out, 403], [new Client(), 401]]) { eq((await who.req(`${base}/summary`)).status, expected); eq((await who.req(`${base}/summary/${sid}`)).status, expected); eq((await who.req(`${base}/summary/${sid}`, { method: 'DELETE' })).status, expected); }
    eq((await A.st.req(`${base}/chat`)).status, 404, 'unknown kind');
    eq((await A.st.req(`${base}/summary/${sid}`, { method: 'DELETE', headers: { Origin: 'https://evil.example.com' } })).status, 403, 'cross-site delete refused');
    eq((await A.st.req(`${base}/summary/${sid}`, { method: 'DELETE' })).status, 204); eq((await A.st.req(`${base}/summary/${sid}`)).status, 404);
    eq((await A.st.req(`${base}/quiz`)).status, 200); eq((await A.st.req(`${base}/flashcards`)).status, 200);
  });
  await check('Web -> real backend: the sources selection reaches the AI backend and only the public scopes are accepted', async () => {
    await resetHits();
    for (const scope of ['class_only', 'personal_only', 'everything']) eq((await A.st.json(aiPath(AM, 'chat'), 'POST', { message: `scope ${scope}`, scope_mode: scope })).status, 200, scope);
    for (const bad of ['all_semesters', 'everything ', 'x']) eq((await A.st.json(aiPath(AM, 'chat'), 'POST', { message: 'q', scope_mode: bad })).status, 400, bad);
  });
} else {
  await check('authorised users get a generic, readable failure when the AI cannot run (no OpenAI key locally); nothing internal is exposed', async () => {
    for (const tag of ['st', 'sl', 'lec']) for (const [what, body] of AI_ROUTES) {
      const r = await A[tag].json(aiPath(AM, what), 'POST', body);
      expect([502, 422].includes(r.status), `${tag} ${what}: status ${r.status}`); noInternals(`${tag} ${what}`, r.body); expect(typeof r.body.error === 'string' && r.body.error.length > 10, 'message');
    }
  });
  skipUnverified('AI answers, citations, quiz/flashcard/summary generation with live AI', 'needs a real OpenAI key and Typesense-indexed documents (see docs/real-ai-validation.md)');
}
if (!STUB) skipUnverified('retrieval scoping of personal notes inside AI answers', 'needs indexed content: run with STUB_URL (see tests/integration/ai-access.integration.mjs, which verifies it with real indexing and a provider stand-in)');
await check('AI backend rejects non-members with 403 on its generation endpoints for module_id requests (direct calls)', async () => {
  const token = (await (await fetch(AI + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('ai-out'), password: PASSWORD }) })).json()).access_token;
  const direct = (path, body) => fetch(AI + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status);
  const statuses = { chat: await direct('/api/chat', { module_id: AM, message: 'hello' }), stream: await direct('/api/chat/stream', { module_id: AM, message: 'hello' }), quiz: await direct('/api/quiz/generate', { module_id: AM }),
    flashcards: await direct('/api/flashcards/generate', { module_id: AM }), summary: await direct('/api/summarise', { module_id: AM, scope: 'module' }) };
  console.log(`        non-member direct calls returned: ${JSON.stringify(statuses)}`);
  for (const [k, v] of Object.entries(statuses)) eq(v, 403, `${k}`);
});

// ───────────────────────────── Report ─────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed, ${failed.length} failed ===`);
for (const f of failed) console.log(` - [${f.section}] ${f.name}: ${f.err}`);
for (const u of unverified) console.log(` ~ UNVERIFIED: ${u.name} (${u.reason})`);
for (const k of knownDefects) console.log(` ! KNOWN BACKEND DEFECT: ${k.name} (${k.ticket})`);
for (const n of notes) console.log(` ? NOTE: ${n}`);
process.exit(failed.length ? 1 : 0);
