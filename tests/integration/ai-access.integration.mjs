// Security verification of the StudyMind AI backend's module authorization for AI generation endpoints (final fail-closed contract).
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

// ═════════════════════════ Route registration ═════════════════════════
group('Route registration (what the RUNNING backend serves, plus behavioural proof that each route answers)');
await check('the running backend registers every AI route (openapi) - a nested/unregistered handler would be missing here', async () => {
  const paths = (await (await fetch(AI + '/openapi.json')).json()).paths;
  const need = ['/api/chat', '/api/chat/stream', '/api/chat/general', '/api/chat/transcribe', '/api/chat/extract-image', '/api/quiz/generate', '/api/quiz/{attempt_id}/submit', '/api/flashcards/generate', '/api/summarise'];
  const missing = need.filter((p) => !(paths[p] && paths[p].post));
  expect(missing.length === 0, `routes NOT registered: ${missing.join(', ')}`);
});
await check('/api/chat/general and /api/chat/transcribe actually answer: guarded by auth (401, not 404) and validate input (not 404)', async () => {
  for (const path of ['/api/chat/general', '/api/chat/transcribe']) eq((await api(null, 'POST', path, { message: 'hi', audio_base64: 'AAAA' })).status, 401, `${path} unauthenticated`);
  const bad = await api(stA.token, 'POST', '/api/chat/transcribe', { audio_base64: '!!not-base64!!' }); eq(bad.status, 400, 'transcribe rejects invalid audio (route is live)');
  const invalid = await api(stA.token, 'POST', '/api/chat/general', { message: '' }); eq(invalid.status, 422, 'general chat validates input (route is live)');
});

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
// ── evidence helpers: every probe reports HTTP status, provider calls, and canaries found in the PROMPT and in the RESPONSE ──
const ALL_KEYS = ['M', 'N', 'N2', 'P', 'PA'];
const inPrompt = (r, k) => r.prompts.some((p) => p.includes(CANARY(k)));
const inResponse = (r, k) => r.response.includes(CANARY(k));
const evidence = (r) => `HTTP ${r.status} | provider calls: ${r.providerCalls} | canary in prompt: ${ALL_KEYS.filter((k) => inPrompt(r, k)).join(',') || 'none'} | canary in response: ${ALL_KEYS.filter((k) => inResponse(r, k)).join(',') || 'none'}`;
/** Fail-closed: refused with one of `statuses`, the provider was never called, and no foreign canary appears anywhere. */
const failClosed = (r, statuses, foreign, label) => {
  const leaked = foreign.some((k) => inPrompt(r, k) || inResponse(r, k));
  // [LEAK] = unauthorized material reached the provider/response; [CONTRACT] = the fail-closed rule was not enforced but no foreign material moved.
  const tag = leaked ? '[LEAK]' : '[CONTRACT]';
  expect(statuses.includes(r.status) && r.providerCalls === 0 && !leaked,
    `${tag} ${label}: expected HTTP ${statuses.join('/')} with NO provider call and no foreign material; ${evidence(r)}`);
  return evidence(r);
};
/** Authorised-but-scoped: no foreign canary may reach the provider prompt (a security failure even if the response hides it) or the response. */
const noForeign = (r, foreign, label) => {
  const inP = foreign.filter((k) => inPrompt(r, k)), inR = foreign.filter((k) => inResponse(r, k));
  expect(!inP.length && !inR.length, `[LEAK] ${label}: UNAUTHORIZED material reached the ${inP.length ? 'PROVIDER PROMPT' : ''}${inP.length && inR.length ? ' and ' : ''}${inR.length ? 'RESPONSE' : ''} (${[...new Set([...inP, ...inR])].join(',')}); ${evidence(r)}`);
  return evidence(r);
};
const GEN = ['POST /api/quiz/generate', 'POST /api/flashcards/generate', 'POST /api/summarise'];
const genBody = (name, ids) => ({ ...ids, ...(name.endsWith('summarise') ? { scope: ids.week_id ? 'week' : 'module' } : {}), ...(name.endsWith('quiz/generate') ? { question_count: 5 } : {}) });
const CHAT = ENDPOINTS['POST /api/chat'], STREAM = ENDPOINTS['POST /api/chat/stream'];
const MSG = 'Summarise the key marker in the notes';

group('Task 3/5 - positive controls and retrieval isolation (real index; prompts AND responses inspected)');
await check('control: an enrolled student retrieves module M (so absence of other canaries is meaningful)', async () => {
  const r = await fire(CHAT, stA, CHAT.build(M)); eq(r.status, 200); expect(inPrompt(r, 'M') && inResponse(r, 'M'), `canary M missing; ${evidence(r)}`);
});
const ISOLATION = [['enrolled student (A) in M', stA, M, ['M', 'PA'], ['N', 'N2', 'P']], ['lecturer A (owner of M)', lecA, M, ['M'], ['N', 'N2', 'P', 'PA']],
  ['lecturer B (owner of N2, same course code as M)', lecB, N2, ['N2'], ['M', 'N', 'P', 'PA']], ['student B in N', stB, N, ['N'], ['M', 'N2', 'P', 'PA']],
  ['self-learner in their private module P', slr, P, ['P'], ['M', 'N', 'N2', 'PA']], ['student C in M (another learner)', stC, M, ['M'], ['N', 'N2', 'P', 'PA']]];
for (const [label, user, mod, own, foreign] of ISOLATION) {
  await check(`isolation - ${label}: chat and summary use only their module's material (own: ${own.join('+')}); never ${foreign.join(', ')}`, async () => {
    for (const ep of [CHAT, ENDPOINTS['POST /api/summarise']]) {
      const r = await fire(ep, user, ep.build(mod)); expect(r.status < 300, `status ${r.status}`);
      for (const k of own.filter((k) => k !== 'PA' || user === stA)) expect(inPrompt(r, k), `own canary ${k} missing from the prompt (retrieval not working); ${evidence(r)}`);
      noForeign(r, foreign, `${ep.path} as ${label}`);
    }
  });
}

group('Task 3 - week-based generation and general-knowledge chat');
await check('valid week-based generation works and stays inside the week\'s module (member, owner, and week+module that agree)', async () => {
  for (const [who, ids] of [[stA, { week_id: WM }], [lecA, { week_id: WM }], [stA, { module_id: M, week_id: WM }]]) for (const name of GEN) {
    const r = await fire(ENDPOINTS[name], who, genBody(name, ids)); expect(![401, 403, 404].includes(r.status), `${name}: ${evidence(r)}`); expect(r.providerCalls > 0, 'authorised request must reach the provider');
    expect(inPrompt(r, 'M'), `week material missing from the prompt; ${evidence(r)}`); noForeign(r, ['N', 'N2', 'P'], name);
  }
});
for (const name of GEN) await probe(`nonexistent week_id -> 404, provider NOT called (${name})`, async () => failClosed(await fire(ENDPOINTS[name], stA, genBody(name, { week_id: NONEXISTENT })), [404], ALL_KEYS, name));
const GENERAL = { path: '/api/chat/general' };
await probe('general-knowledge chat (/api/chat/general) is reachable, never retrieves module material and ignores a foreign module_id', async () => {
  const r = await fire(GENERAL, stB, { message: 'What is the key marker in the study notes?', module_id: M });
  expect(r.status === 200, `[CONTRACT] /api/chat/general is not reachable (route not registered); ${evidence(r)}`);
  expect(r.providerCalls > 0, 'general chat should call the provider');
  expect(!ALL_KEYS.some((k) => inPrompt(r, k) || inResponse(r, k)) && !r.prompts.some((p) => /Study notes for/.test(p)), `[LEAK] module material reached a general chat; ${evidence(r)}`);
  eq((await fire(GENERAL, null, { message: 'hello' })).status, 401, 'unauthenticated general chat');
  return evidence(r);
});

group('Task 2 - the 13 previously reported bypasses (fail-closed expectations; every result shows status, provider calls, prompt and response canaries)');
for (const name of GEN) {
  await probe(`#1 ${name}: week_id WITHOUT module_id by a non-member -> 403, provider NOT called`, async () => failClosed(await fire(ENDPOINTS[name], stB, genBody(name, { week_id: WM })), [403], ['M'], name));
  await probe(`#2 ${name}: document_id WITHOUT module_id -> fails closed (422 accepted), provider NOT called`, async () => failClosed(await fire(ENDPOINTS[name], stB, genBody(name, { document_id: docM })), [422, 403], ['M'], name));
  await probe(`#3 ${name}: RANDOM document UUID -> fails closed, provider NOT called`, async () => failClosed(await fire(ENDPOINTS[name], stB, genBody(name, { document_id: NONEXISTENT })), [422, 403, 404], ALL_KEYS, name));
  await probe(`#8 ${name}: conflicting module_id + week_id (B in N, week of M) -> 403, provider NOT called`, async () => failClosed(await fire(ENDPOINTS[name], stB, genBody(name, { module_id: N, week_id: WM })), [403], ['M'], name));
  await probe(`#8 ${name}: conflicting module_id + week_id (A in M, week of N) -> 403, provider NOT called`, async () => failClosed(await fire(ENDPOINTS[name], stA, genBody(name, { module_id: M, week_id: WN })), [403], ['N'], name));
  await probe(`#9 ${name}: conflicting module_id + document_id (B in N, doc of M) -> fails closed, provider NOT called`, async () => failClosed(await fire(ENDPOINTS[name], stB, genBody(name, { module_id: N, document_id: docM })), [422, 403], ['M'], name));
}
await probe('#4 POST /api/chat: no module_id -> unscoped grounded chat rejected (422), provider NOT called', async () => failClosed(await fire(CHAT, stB, { message: MSG }), [422], ['M', 'N2'], 'chat'));
await probe('#4b POST /api/chat: no module_id is rejected even for a user who is a member of modules', async () => failClosed(await fire(CHAT, stA, { message: MSG }), [422], ['N', 'N2'], 'chat (member)'));
await probe('#5 POST /api/chat/stream: no module_id -> rejected (422), provider NOT called', async () => failClosed(await fire(STREAM, stB, { message: MSG }), [422], ['M', 'N2'], 'stream'));
await probe('#6 POST /api/chat: existing session id WITHOUT module_id -> rejected, provider NOT called', async () => {
  const own = await api(stB.token, 'POST', '/api/chat', { module_id: N, message: 'hello' }); expect(own.status === 200, `setup ${own.status}`);
  return failClosed(await fire(CHAT, stB, { session_id: own.json.session_id, message: MSG }), [422], ['M', 'N2'], 'session without module');
});
await probe('#7 course-code collision: M and N2 share a course code; every module-scoped call for M retrieves M only', async () => {
  const lines = [];
  for (const [ep, body_] of [[CHAT, CHAT.build(M)], ...GEN.map((n) => [ENDPOINTS[n], genBody(n, { module_id: M })])]) { const r = await fire(ep, stA, body_); expect(inPrompt(r, 'M'), `M missing (control); ${evidence(r)}`); lines.push(noForeign(r, ['N2', 'N'], ep.path)); }
  const rev = await fire(CHAT, lecB, CHAT.build(N2)); expect(inPrompt(rev, 'N2'), 'N2 missing (control)'); lines.push(noForeign(rev, ['M'], 'reverse direction (lecturer B on N2)'));
  return lines[0];
});
await probe('#10 personal notes of another user (A\'s note in M) never reach another learner, the lecturer or the provider (chat + all generators)', async () => {
  let last;
  for (const who of [stC, lecA]) for (const [ep, b] of [[CHAT, CHAT.build(M)], ...GEN.map((n) => [ENDPOINTS[n], genBody(n, { module_id: M })])]) { const r = await fire(ep, who, b); expect(inPrompt(r, 'M'), `M missing (control) ${ep.path}`); last = noForeign(r, ['PA'], `${ep.path}`); }
  return last;
});
await probe("#11 another user's chat session id is refused (404), provider NOT called", async () => {
  const mine = await api(stA.token, 'POST', '/api/chat', { module_id: M, message: 'hello' });
  return failClosed(await fire(CHAT, stB, CHAT.build(N, { session_id: mine.json.session_id })), [404], ['M'], 'foreign session');
});
await probe("#11b own session from module N reused with module M (not a member) -> 403, provider NOT called", async () => {
  const own = await api(stB.token, 'POST', '/api/chat', { module_id: N, message: 'hello' });
  return failClosed(await fire(CHAT, stB, CHAT.build(M, { session_id: own.json.session_id })), [403], ['M'], 'own session, foreign module');
});
await probe('#12 scope-mode broadening (all_semesters / class_only / personal_only, include_archived, top_k=20) cannot widen beyond the authorised module', async () => {
  let last;
  for (const ep of [CHAT, STREAM]) for (const extra of [{ scope_mode: 'all_semesters', include_archived: true }, { scope_mode: 'class_only', top_k: 20 }, { scope_mode: 'personal_only' }, { scope_mode: 'everything', include_archived: true, top_k: 20 }])
    last = noForeign(await fire(ep, stB, ep.build(N, extra)), ['M', 'N2', 'P', 'PA'], `${ep.path} ${JSON.stringify(extra)}`);
  return last;
});
console.log('  NOTE  #13 (direct API access bypassing Web): every request above was sent straight to the backend with valid tokens; the Web proxy is not in the path.');

// ═════════════════════════ report ═════════════════════════
const failed = results.filter((r) => !r.ok);
const pass = results.filter((r) => r.ok).length;
console.log(`\n=== ${pass}/${results.length} checks passed, ${failed.length} failed, ${defects.length} security DEFECT(S) found ===`);
for (const f of failed) console.log(` - FAIL [${f.section}] ${f.name}: ${f.err}`);
const leaks = defects.filter((d) => d.evidence.startsWith('[LEAK]')), contract = defects.length - leaks.length;
console.log(`    of which ${leaks.length} LEAK (unauthorized material reached the provider and/or response) and ${contract} CONTRACT (fail-closed rule not enforced, no foreign material moved)`);
for (const d of defects) console.log(` ! DEFECT [${d.section.split(' - ')[0]}] ${d.name}\n     ${d.evidence}`);
process.exit(failed.length || (defects.length && !process.env.ALLOW_DEFECTS) ? 1 : 0);
