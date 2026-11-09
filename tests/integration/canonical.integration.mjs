// Opt-in integration suite: StudyMind Web API routes <-> a LOCAL StudyMind AI backend.
//
//   WEB_URL=http://127.0.0.1:3100 AI_URL=http://127.0.0.1:8000 \
//   AI_PSQL="psql -h 127.0.0.1 -p 55432 -U sm_test -d studymind_it" npm run test:integration
//
// Safety: refuses to run against anything but loopback hosts. It creates throwaway accounts
// (random emails) and never reads or writes real users.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const WEB = process.env.WEB_URL;
const AI = process.env.AI_URL;
if (!WEB || !AI) { console.log('Skipping: set WEB_URL and AI_URL (local only) to run integration tests.'); process.exit(0); }
for (const u of [WEB, AI]) {
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
{
  // Behaviour to confirm with the product owner: the class owner can delete a learner's personal note.
  const probe = await aiUpload('s3', CM, 'sec-owner-delete-probe.txt', 'probe', 'personal');
  const doc = (await aiCall('s3', `/api/modules/${CM}/documents`)).body.find((d) => d.filename === 'sec-owner-delete-probe.txt');
  const del = await aiCall('lec', `/api/modules/${CM}/documents/${doc.document_id}`, { method: 'DELETE' });
  if (probe.status === 201 && del.status === 204) note("the class owner can DELETE an enrolled learner's personal note (AI delete allows module owner) - confirm this is intended moderation");
  else note(`owner-delete of a learner's personal note could not be verified locally (delete returned ${del.status}; the AI delete path needs Typesense). The code permits the module owner to delete any document in the module - confirm intent.`);
}
await knownDefect('same-filename uploads: a learner\'s personal file must not supersede or hide class material', 'AI app/api/modules.py _ingest_module_document: version lookup matches Document.filename only (no owner/visibility scope), so a personal upload flips the class file to is_latest=false', async () => {
  eq((await lec.upload(CM, 'policy.txt', Buffer.from('official class policy'), 'class', 'text/plain')).status, 201);
  const before = await webNames('s3'); expect(before.includes('policy.txt'), 'precondition: class policy visible');
  eq((await s1.upload(CM, 'policy.txt', Buffer.from('my own policy notes'), 'personal', 'text/plain')).status, 201, 'learner upload');
  for (const viewer of ['s3', 'lec']) {
    const d = (await aiCall(viewer, `/api/modules/${CM}/documents`)).body.filter((x) => x.filename === 'policy.txt');
    expect(d.some((x) => x.visibility === 'class'), `CLASS MATERIAL HIDDEN from ${viewer}: a learner's same-named personal upload superseded it (is_latest)`);
  }
});

// ───────────────────────────── Report ─────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed, ${failed.length} failed ===`);
for (const f of failed) console.log(` - [${f.section}] ${f.name}: ${f.err}`);
for (const k of knownDefects) console.log(` ! KNOWN BACKEND DEFECT: ${k.name} (${k.ticket})`);
for (const n of notes) console.log(` ? NOTE: ${n}`);
process.exit(failed.length ? 1 : 0);
