import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCrossSite } from '../src/lib/request-origin.mjs';
import { SCOPES, mapSessionDetail, mapSessionList, parseChatInput, sessionIds, toChatRequest } from '../src/lib/learning-ai.mjs';

const ID = '8f14e45f-ceea-467f-a8d4-1b0d1f3f6a10';

test('chat input: sources selection defaults to everything and only the three public scopes are accepted', () => {
  assert.equal(parseChatInput({ message: 'hi' }).value.scope_mode, 'everything');
  for (const scope of SCOPES) assert.equal(parseChatInput({ message: 'hi', scope_mode: scope }).value.scope_mode, scope);
  for (const bad of ['all_semesters', 'EVERYTHING', 'class', '', null, 0, {}, ['class_only']]) {
    const r = parseChatInput({ message: 'hi', scope_mode: bad });
    // null falls back to the default (JSON null means "not provided"); everything else is rejected
    if (bad === null) assert.equal(r.ok, true); else assert.equal(r.ok, false, JSON.stringify(bad));
  }
  assert.equal(parseChatInput({ message: 'hi', include_archived: true }).value.include_archived, undefined, 'include_archived is never forwarded');
});

test('chat request to the backend carries the chosen scope, the URL module and nothing from the browser body', () => {
  const v = parseChatInput({ message: 'hi', scope_mode: 'personal_only', module_id: 'evil', user_id: 'evil' }).value;
  const body = toChatRequest(ID, v);
  assert.equal(body.scope_mode, 'personal_only'); assert.equal(body.module_id, ID);
  assert.deepEqual(Object.keys(body).sort(), ['complexity', 'message', 'module_id', 'scope_mode']);
});

test('session list: only well-formed ids, fixed fields, no module or user identifiers forwarded', () => {
  const raw = [
    { id: ID.toUpperCase(), title: 'Explain mitochondria', updated_at: '2026-11-12T10:00:00Z', message_count: 4, module_id: 'm', user_id: 'u', is_active: true },
    { id: 'not-a-uuid', title: 'x' }, null, 'junk', { id: 123 },
    { id: '11111111-1111-4111-8111-111111111111', title: '', updated_at: 'nonsense', message_count: -3 },
  ];
  const list = mapSessionList(raw);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: ID, title: 'Explain mitochondria', updated_at: '2026-11-12T10:00:00Z', message_count: 4 });
  assert.deepEqual(list[1], { id: '11111111-1111-4111-8111-111111111111', title: 'New conversation', updated_at: null, message_count: 0 });
  assert.deepEqual(mapSessionList('nope'), []);
  assert.equal(mapSessionList(Array.from({ length: 80 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: 't' }))).length, 50);
});

test('session ids are lower-cased and malformed entries ignored (used for the module-membership check)', () => {
  assert.deepEqual(sessionIds([{ id: ID.toUpperCase() }, { id: 'x' }, {}]), [ID]);
  assert.deepEqual(sessionIds(null), []);
});

test('session detail: roles whitelisted, citations only on assistant messages, no internal fields', () => {
  const d = mapSessionDetail({ id: ID, title: 'T', user_id: 'u', messages: [
    { id: 'm1', role: 'user', content: 'Q', created_at: '2026-11-12T10:00:00Z', sources: [{ filename: 'leak.pdf' }], latency_ms: 5 },
    { id: 'm2', role: 'assistant', content: 'A', created_at: '2026-11-12T10:00:02Z', sources: [{ filename: 'notes.docx', content_snippet: 'snip', document_id: 'd1' }, { filename: 'notes.docx' }, { nope: 1 }], token_count: 9 },
    { id: 'm3', role: 'system', content: 'hidden prompt' }, { role: 'assistant' },
  ] });
  assert.equal(d.messages.length, 2);
  assert.deepEqual(d.messages[0], { id: 'm1', role: 'user', content: 'Q', created_at: '2026-11-12T10:00:00Z', sources: [] });
  assert.deepEqual(d.messages[1].sources, [{ filename: 'notes.docx', snippet: 'snip', document_id: 'd1' }]);
  assert.equal(JSON.stringify(d).includes('hidden prompt'), false); assert.equal('user_id' in d, false);
  assert.equal(mapSessionDetail({ id: ID }), null); assert.equal(mapSessionDetail(null), null);
});

test('history routes: module access first, module-membership proof, same-origin check on delete, and a tight upstream allow-list', () => {
  const proxy = readFileSync('src/lib/learning-ai-proxy.ts', 'utf8');
  assert.match(proxy, /ownSessionsForModule[\s\S]*requireModuleAccess\(moduleId\)/, 'module access is checked before any history call');
  assert.match(proxy, /sessionIds\(own\.raw\)\.includes\(sessionId\.toLowerCase\(\)\)/, 'the session must be one of the caller\'s chats for THIS module');
  assert.match(proxy, /export async function sessionDelete\(request: Request[\s\S]*isCrossSite\(request\)/);
  const identity = readFileSync('src/lib/studymind-identity.ts', 'utf8');
  assert.match(identity, /sessions\(\\\?module_id=\[0-9a-f-\]\{36\}\)\?\$\|sessions\\\/\[0-9a-f-\]\{36\}\$/, 'only the module-filtered list and one session id are reachable');
  assert.doesNotMatch(identity, /sessions\(\\\/\|\$\)|sessions\.\*/, 'no open-ended /api/sessions access');
});

const req = (headers) => new Request('http://localhost:3100/api/x', { method: 'DELETE', headers });
test('cross-site check: trusts Sec-Fetch-Site, otherwise compares Origin with the Host the client used (not request.url)', () => {
  assert.equal(isCrossSite(req({ 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:3100', host: '127.0.0.1:3100' })), false, 'a same-origin browser request is allowed even if request.url says localhost');
  assert.equal(isCrossSite(req({ 'sec-fetch-site': 'same-site' })), false); assert.equal(isCrossSite(req({ 'sec-fetch-site': 'none' })), false);
  assert.equal(isCrossSite(req({ 'sec-fetch-site': 'cross-site', origin: 'http://127.0.0.1:3100', host: '127.0.0.1:3100' })), true, 'the browser header wins');
  assert.equal(isCrossSite(req({ origin: 'https://evil.example.com', host: 'localhost:3100' })), true);
  assert.equal(isCrossSite(req({ origin: 'http://localhost:3100', host: 'localhost:3100' })), false);
  assert.equal(isCrossSite(req({ origin: 'http://localhost:3100', host: 'LOCALHOST:3100' })), false, 'host comparison is case-insensitive');
  assert.equal(isCrossSite(req({ origin: 'https://app.example.com', 'x-forwarded-host': 'app.example.com', host: 'internal:10000' })), false, 'behind a proxy the public host is used');
  assert.equal(isCrossSite(req({ origin: 'https://evil.example.com', 'x-forwarded-host': 'app.example.com' })), true);
  assert.equal(isCrossSite(req({})), false, 'no browser headers: not a browser cross-site request');
  assert.equal(isCrossSite(req({ origin: 'not a url', host: 'localhost:3100' })), true); assert.equal(isCrossSite(req({ origin: 'http://x' })), true, 'an Origin with no Host is refused');
  const read = (p) => readFileSync(p, 'utf8');
  for (const f of ['src/lib/learning-ai-proxy.ts', 'src/app/api/studymind/checkout/route.ts']) { assert.match(read(f), /isCrossSite\(request\)/, f); assert.doesNotMatch(read(f), /new URL\(request\.url\)\.host/, `${f} must not compare against request.url`); }
});
