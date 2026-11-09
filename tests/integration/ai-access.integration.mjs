// Security verification of the StudyMind AI backend's module authorization for AI generation endpoints.
// Talks DIRECTLY to the backend (not through Web) so nothing depends on Web's own guard.
//
// Evidence model: the backend is started with its OpenAI base URL pointing at tests/fixtures/openai-stub.mjs, a
// recording stand-in that (a) counts and logs every provider call, (b) returns constant embeddings, and (c) echoes
// its prompt. Documents go through the REAL upload path (real extraction, chunking, Typesense indexing). A request
// "reached the AI" if the stub saw it; "leaked" if another module's canary phrase appears in the prompt sent to the
// provider or in the response. This is NOT live OpenAI: it distinguishes authorization from AI execution.
//
//   AI_URL=http://127.0.0.1:8000 STUB_URL=http://127.0.0.1:18200 TS_URL=http://127.0.0.1:18108 TS_KEY=local-test-key \
//     node tests/integration/ai-access.integration.mjs
//   TS_URL/TS_KEY point at the DISPOSABLE Typesense the backend uses: the suite empties its chunk collection first, because
//   with constant stub embeddings retrieval order is arbitrary and leftover chunks from other runs could hide a leak.
//   (loopback only; exit code 1 if any check fails or any defect probe finds a bypass; ALLOW_DEFECTS=1 to exit 0)
import { randomBytes } from 'node:crypto';

const AI = process.env.AI_URL, STUB = process.env.STUB_URL, TS = process.env.TS_URL, TS_KEY = process.env.TS_KEY;
if (!AI || !STUB) { console.log('Skipping: set AI_URL and STUB_URL (local only).'); process.exit(0); }
for (const u of [AI, STUB, ...(TS ? [TS] : [])]) if (!['127.0.0.1', 'localhost'].includes(new URL(u).hostname)) { console.error('Refusing non-local host'); process.exit(2); }

const run = randomBytes(4).toString('hex');
const PASSWORD = 'Security-Test-Pass-123!';
const results = [], defects = [];
let section = '';
const group = (n) => { section = n; console.log(`\n## ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const expect = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m = '') => expect(a === b, `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function check(name, fn) {
  try { await fn(); results.push({ section, name, ok: true }); console.log(`  PASS  ${name}`); }
  catch (e) { results.push({ section, name, ok: false, err: e.message }); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
/** A probe asserts the SECURE behaviour; a failure is recorded as a DEFECT with reproduction evidence, never as a pass. */
async function probe(name, fn) {
  try { const evidence = await fn(); console.log(`  SAFE    ${name}${evidence ? `\n          ${evidence}` : ''}`); results.push({ section, name, ok: true }); }
  catch (e) { defects.push({ section, name, evidence: e.message }); console.log(`  DEFECT  ${name}\n          ${e.message}`); }
}

// ── plumbing ──
async function api(token, method, path, body, form) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(AI + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* streaming or plain text */ }
  return { status: res.status, text, json };
}
const clearHits = () => fetch(STUB + '/__hits', { method: 'DELETE' });
const getHits = async () => { await sleep(150); return (await fetch(STUB + '/__hits')).json(); };
async function account(tag, role) {
  const email = `sec-${run}-${tag}@example.com`;
  const r = await api(null, 'POST', '/api/auth/register', { email, password: PASSWORD, full_name: `Sec ${tag}`, role });
  expect(r.status === 201 || r.status === 200, `register ${tag}: ${r.status} ${r.text.slice(0, 120)}`);
  const l = await api(null, 'POST', '/api/auth/login', { email, password: PASSWORD });
  return { tag, token: l.json.access_token, id: (await api(l.json.access_token, 'GET', '/api/auth/me')).json.id };
}
async function createModule(owner, title, access_type, course_code) {
  const r = await api(owner.token, 'POST', '/api/modules', { title, access_type, ...(course_code ? { course_code } : {}) });
  expect(r.status === 201, `create module ${title}: ${r.status} ${r.text.slice(0, 120)}`); return r.json.id;
}
async function upload(user, moduleId, filename, text, visibility, weekId) {
  const f = new FormData(); f.set('file', new File([Buffer.from(text)], filename, { type: 'text/plain' }));
  const q = `?visibility=${visibility}${weekId ? `&week_id=${weekId}` : ''}`;
  const r = await api(user.token, 'POST', `/api/modules/${moduleId}/documents${q}`, undefined, f);
  expect(r.status === 201 && r.json.status === 'indexed', `upload ${filename}: ${r.status} ${r.text.slice(0, 160)}`);
  return r.json.document_id;
}
const CANARY = (k) => `CANARY-${k}-${run}`;
const body = (k) => `Study notes for ${k}. The key marker is ${CANARY(k)}. It covers force, mass, acceleration, energy and momentum for revision.`;

// ── fixtures: real accounts, modules, weeks and indexed documents ──
console.log(`Security verification run ${run} against ${AI}`);
if (TS) {
  // Disposable, loopback-only index: start empty so every probe result is attributable to THIS run's documents.
  const r = await fetch(`${TS}/collections/document_chunks/documents?filter_by=${encodeURIComponent('chunk_index:>=0')}`, { method: 'DELETE', headers: { 'X-TYPESENSE-API-KEY': TS_KEY || '' } });
  console.log(`Typesense chunk collection emptied: ${r.ok ? JSON.stringify(await r.json()) : `HTTP ${r.status} (continuing; results may be less conclusive)`}`);
} else console.log('NOTE: TS_URL not set - leftover chunks from earlier runs can make "no leak" results inconclusive.');
const lecA = await account('lecA', 'lecturer'), lecB = await account('lecB', 'lecturer');
const stA = await account('stA', 'student'), stB = await account('stB', 'student'), stC = await account('stC', 'student');
const slr = await account('slr', 'self_learner');
const CODE_A = `SECA${run}`.toUpperCase(), CODE_B = `SECB${run}`.toUpperCase();
const M = await createModule(lecA, 'Module M (Lecturer A)', 'class', CODE_A);
const N = await createModule(lecB, 'Module N (Lecturer B)', 'class', CODE_B);
const N2 = await createModule(lecB, 'Module N2 (shares course code with M)', 'class', CODE_A);
const P = await createModule(slr, 'Private module (self-learner)', 'personal');
const week = async (owner, mod) => (await api(owner.token, 'POST', `/api/modules/${mod}/weeks`, { week_number: 1, title: 'Week one material' })).json.id;
const WM = await week(lecA, M), WN = await week(lecB, N);
const docM = await upload(lecA, M, 'm-notes.txt', body('M'), 'class', WM);
const docN = await upload(lecB, N, 'n-notes.txt', body('N'), 'class', WN);
await upload(lecB, N2, 'n2-notes.txt', body('N2'), 'class');
await upload(slr, P, 'p-notes.txt', body('P'), 'personal');
for (const [u, m] of [[stA, M], [stC, M], [stB, N]]) eq((await api(u.token, 'POST', '/api/modules/join', { course_id: m })).status, 200, `join ${u.tag}`);
await upload(stA, M, 'a-personal.txt', body('PA'), 'personal');           // a learner's private note inside lecturer A's module
const NONEXISTENT = '00000000-0000-4000-8000-00000000dead';

// ── request builders for the five endpoints ──
const ENDPOINTS = {
  'POST /api/chat': { path: '/api/chat', build: (m, x = {}) => ({ module_id: m, message: 'Summarise the key marker in the notes', ...x }) },
  'POST /api/chat/stream': { path: '/api/chat/stream', build: (m, x = {}) => ({ module_id: m, message: 'Summarise the key marker in the notes', ...x }) },
  'POST /api/quiz/generate': { path: '/api/quiz/generate', build: (m, x = {}) => ({ module_id: m, question_count: 5, ...x }) },
  'POST /api/flashcards/generate': { path: '/api/flashcards/generate', build: (m, x = {}) => ({ module_id: m, ...x }) },
  'POST /api/summarise': { path: '/api/summarise', build: (m, x = {}) => ({ module_id: m, scope: 'module', ...x }) },
};
/** Sends one request and reports what the provider saw. */
async function fire(ep, user, payload) {
  await clearHits();
  const r = await api(user?.token, 'POST', ep.path, payload);
  const hits = await getHits();
  const prompts = hits.filter((h) => h.path === 'chat.completions').map((h) => h.text);
  return { status: r.status, reachedAI: hits.length > 0, providerCalls: hits.length, prompts, response: r.text };
}
const seen = (r, key) => r.prompts.some((p) => p.includes(CANARY(key))) || r.response.includes(CANARY(key));

// ═════════════════════════ Task 1: authorization matrix per endpoint ═════════════════════════
for (const [name, ep] of Object.entries(ENDPOINTS)) {
  group(`Task 1 - ${name}`);
  const authorized = (label, user, mod) => check(`${label}: authorized (not 401/403/404) and the request reaches the AI provider`, async () => {
    const r = await fire(ep, user, ep.build(mod)); expect(![401, 403, 404].includes(r.status), `status ${r.status}`); expect(r.reachedAI, 'authorized request never reached the provider');
    if (name.includes('chat') || name.includes('summarise')) expect(r.status < 300, `status ${r.status}`);
    return r;
  });
  const refused = (label, user, mod, status) => check(`${label}: ${status} and the AI provider is NEVER called`, async () => {
    const r = await fire(ep, user, ep.build(mod)); eq(r.status, status, 'status'); eq(r.providerCalls, 0, 'provider calls for a refused request');
  });
  await authorized('module owner (Lecturer A) on module M', lecA, M);
  await authorized('enrolled student (Student A) on module M', stA, M);
  await authorized('self-learner on their own private module', slr, P);
  await refused('non-enrolled student (Student B) on module M', stB, M, 403);
  await refused('unrelated lecturer (Lecturer B) on module M', lecB, M, 403);
  await refused('enrolled student on someone\'s private module', stA, P, 403);
  await refused('unrelated lecturer on someone\'s private module', lecA, P, 403);
  await refused('unauthenticated request', null, M, 401);
  await refused('nonexistent module', stA, NONEXISTENT, 404);
}

// ═════════════════════════ Task 2: alternative scope bypasses ═════════════════════════
group('Task 2 - positive controls (the leak probes below are meaningful only if retrieval demonstrably works)');
await check('control: an enrolled student\'s chat retrieves module M material (canary reaches the provider and the answer)', async () => {
  const r = await fire(ENDPOINTS['POST /api/chat'], stA, ENDPOINTS['POST /api/chat'].build(M)); eq(r.status, 200); expect(seen(r, 'M'), 'canary M missing - retrieval is not working');
});
await check('control: the same student\'s chat also retrieves their own personal note, and the lecturer\'s chat on M does not', async () => {
  const own = await fire(ENDPOINTS['POST /api/chat'], stA, ENDPOINTS['POST /api/chat'].build(M)); expect(seen(own, 'PA'), "owner should see their own note");
  const lec = await fire(ENDPOINTS['POST /api/chat'], lecA, ENDPOINTS['POST /api/chat'].build(M)); expect(!seen(lec, 'PA'), "PRIVACY: lecturer's retrieval included a student's personal note");
});
await check('control: Student C (same module) never retrieves Student A\'s personal note', async () => {
  const r = await fire(ENDPOINTS['POST /api/chat'], stC, ENDPOINTS['POST /api/chat'].build(M)); eq(r.status, 200); expect(seen(r, 'M'), 'class material should be retrieved'); expect(!seen(r, 'PA'), "PRIVACY: another learner's personal note was retrieved");
});

await check('control: UNSCOPED retrieval demonstrably works here - a chat without module_id by a member of M retrieves module M (so a "no leak" result for a non-member is conclusive)', async () => {
  const r = await fire(ENDPOINTS['POST /api/chat'], stA, { message: 'Summarise the key marker in the notes' });
  eq(r.status, 200); expect(seen(r, 'M'), 'unscoped retrieval did not return module M material at all - leak probes would be vacuous; check the index is clean and top_k covers it');
});

group('Task 2 - scope bypass probes (secure behaviour asserted: no content from a module the caller cannot access; any leak is a DEFECT with evidence)');
const leakReport = (r, keys) => `status ${r.status}; provider calls ${r.providerCalls}; leaked canaries in prompt/response: ${keys.filter((k) => seen(r, k)).join(', ') || 'none'}`;
const notLeaking = (r, keys, label) => { expect(!keys.some((k) => seen(r, k)), `${label} -> ${leakReport(r, keys)}`); return leakReport(r, keys); };
// A bypass probe fails (DEFECT) only if content from a module the caller cannot access reaches the provider or the response.
// Whether the request was refused outright (403) or merely returned nothing is reported in the evidence line.
const mustBeDenied = (r, keys, label) => { const leaked = keys.filter((k) => seen(r, k)); expect(leaked.length === 0, `${label}: foreign class material reached the AI provider/response; ${leakReport(r, keys)}`); return `${leakReport(r, keys)}${r.providerCalls ? ' (request still reached the provider, but no foreign content)' : ''}`; };

for (const name of ['POST /api/quiz/generate', 'POST /api/flashcards/generate', 'POST /api/summarise']) {
  const ep = ENDPOINTS[name]; const extra = name.endsWith('summarise') ? { scope: 'week' } : {};
  await probe(`${name}: week_id of module M alone (Student B is NOT a member of M)`, async () => mustBeDenied(await fire(ep, stB, { week_id: WM, ...extra, ...(name.endsWith('quiz/generate') ? { question_count: 5 } : {}) }), ['M'], 'week_id only'));
  await probe(`${name}: document_id of module M alone (Student B is NOT a member of M)`, async () => mustBeDenied(await fire(ep, stB, { document_id: docM, ...(name.endsWith('summarise') ? { scope: 'document' } : {}), ...(name.endsWith('quiz/generate') ? { question_count: 5 } : {}) }), ['M'], 'document_id only'));
  await probe(`${name}: document_id alone with a RANDOM uuid (no such document) must not retrieve any module's material`, async () => mustBeDenied(await fire(ep, stB, { document_id: NONEXISTENT, ...(name.endsWith('summarise') ? { scope: 'document' } : {}), ...(name.endsWith('quiz/generate') ? { question_count: 5 } : {}) }), ['M', 'N2'], 'random document_id'));
  await probe(`${name}: conflicting scope - module_id=N (B is a member) + week_id of M (B is not)`, async () => mustBeDenied(await fire(ep, stB, { module_id: N, week_id: WM, ...extra, ...(name.endsWith('quiz/generate') ? { question_count: 5 } : {}) }), ['M'], 'conflicting week'));
  await probe(`${name}: conflicting scope - module_id=N (B is a member) + document_id of M (B is not)`, async () => mustBeDenied(await fire(ep, stB, { module_id: N, document_id: docM, ...extra, ...(name.endsWith('quiz/generate') ? { question_count: 5 } : {}) }), ['M'], 'conflicting document'));
}
for (const name of ['POST /api/chat', 'POST /api/chat/stream']) {
  const ep = ENDPOINTS[name];
  await probe(`${name}: omitting module_id must not retrieve class material of modules the caller has not joined`, async () => mustBeDenied(await fire(ep, stB, { message: 'Summarise the key marker in the notes' }), ['M', 'N2'], 'no module_id'));
  await probe(`${name}: scope_mode=all_semesters + include_archived cannot broaden retrieval beyond the authorised module (Student B in N)`, async () =>
    notLeaking(await fire(ep, stB, ep.build(N, { scope_mode: 'all_semesters', include_archived: true })), ['M', 'N2', 'P'], 'broadened scope'));
}
await probe("POST /api/chat: module_id=M with a session that belongs to ANOTHER user's conversation is refused", async () => {
  const mine = await api(stA.token, 'POST', '/api/chat', { module_id: M, message: 'hello' }); const sid = mine.json.session_id;
  const r = await fire(ENDPOINTS['POST /api/chat'], stB, ENDPOINTS['POST /api/chat'].build(N, { session_id: sid }));
  expect(r.status === 404 && r.providerCalls === 0, `status ${r.status}, provider calls ${r.providerCalls} (another user's session id must not be usable)`); return `status ${r.status}; provider calls ${r.providerCalls}`;
});
await probe("POST /api/chat: reusing one's own session from module N while naming module M (not a member) is refused", async () => {
  const own = await api(stB.token, 'POST', '/api/chat', { module_id: N, message: 'hello' }); const sid = own.json.session_id;
  return mustBeDenied(await fire(ENDPOINTS['POST /api/chat'], stB, ENDPOINTS['POST /api/chat'].build(M, { session_id: sid })), ['M'], 'own session, foreign module');
});
await probe("POST /api/chat: a session created in module N cannot be used to read module M material by omitting module_id", async () => {
  const own = await api(stB.token, 'POST', '/api/chat', { module_id: N, message: 'hello' }); const sid = own.json.session_id;
  return mustBeDenied(await fire(ENDPOINTS['POST /api/chat'], stB, { session_id: sid, message: 'Summarise the key marker in the notes' }), ['M', 'N2'], 'session without module_id');
});
await probe('POST /api/chat: modules that share a course code do not leak into each other (Student A, module M; N2 has the same course code)', async () => {
  const r = await fire(ENDPOINTS['POST /api/chat'], stA, ENDPOINTS['POST /api/chat'].build(M));
  expect(!seen(r, 'N2'), `module N2's class material appeared in a chat scoped to module M (same course code ${CODE_A}); ${leakReport(r, ['M', 'N', 'N2'])}`); return leakReport(r, ['M', 'N', 'N2']);
});
await probe('POST /api/summarise: the same course-code collision for summaries (Student A, module M)', async () => {
  const r = await fire(ENDPOINTS['POST /api/summarise'], stA, ENDPOINTS['POST /api/summarise'].build(M));
  expect(!seen(r, 'N2'), `module N2's class material appeared in a summary scoped to module M; ${leakReport(r, ['M', 'N2'])}`); return leakReport(r, ['M', 'N2']);
});
await probe('document_id is ignored when module_id is also given (an authorised user cannot widen scope with a foreign document id)', async () => {
  const r = await fire(ENDPOINTS['POST /api/summarise'], stA, ENDPOINTS['POST /api/summarise'].build(M, { scope: 'document', document_id: docN }));
  expect(!seen(r, 'N'), `module N's material reached a summary requested for module M; ${leakReport(r, ['M', 'N'])}`); return leakReport(r, ['M', 'N']);
});

// ═════════════════════════ report ═════════════════════════
const failed = results.filter((r) => !r.ok);
const pass = results.filter((r) => r.ok).length;
console.log(`\n=== ${pass}/${results.length} checks passed, ${failed.length} failed, ${defects.length} security DEFECT(S) found ===`);
for (const f of failed) console.log(` - FAIL [${f.section}] ${f.name}: ${f.err}`);
for (const d of defects) console.log(` ! DEFECT [${d.section}] ${d.name}\n     ${d.evidence}`);
process.exit(failed.length || (defects.length && !process.env.ALLOW_DEFECTS) ? 1 : 0);
