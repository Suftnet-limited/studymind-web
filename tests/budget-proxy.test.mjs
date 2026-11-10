// Proves the budget proxy enforces its ceilings BEFORE forwarding, serializes requests, never leaks the key, and
// reports measured usage. Upstream is a local fake that returns OpenAI-shaped `usage`; no network, no cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProxy, config, priceOf } from './fixtures/openai-budget-proxy.mjs';

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
async function setup(over = {}, upstreamDelay = 0) {
  const seen = { auth: [], bodies: [], active: 0, maxActive: 0 };
  const up = http.createServer((req, res) => {
    const p = []; req.on('data', (c) => p.push(c)); req.on('end', async () => {
      seen.active++; seen.maxActive = Math.max(seen.maxActive, seen.active);
      seen.auth.push(req.headers.authorization); const body = JSON.parse(Buffer.concat(p).toString()); seen.bodies.push(body);
      await new Promise((r) => setTimeout(r, upstreamDelay));
      seen.active--;
      res.writeHead(200, { 'Content-Type': body.stream ? 'text/event-stream' : 'application/json' });
      if (req.url.endsWith('/embeddings')) return res.end(JSON.stringify({ model: 'text-embedding-3-large', data: [], usage: { prompt_tokens: 1000, total_tokens: 1000 } }));
      const usage = { prompt_tokens: 2000, completion_tokens: 500, total_tokens: 2500 };
      if (body.stream) return res.end(`data: ${JSON.stringify({ model: 'gpt-4.1-mini-2025-04-14', choices: [{ delta: { content: 'x' } }] })}\n\ndata: ${JSON.stringify({ model: 'gpt-4.1-mini-2025-04-14', choices: [], usage })}\n\ndata: [DONE]\n\n`);
      res.end(JSON.stringify({ model: 'gpt-4.1-mini-2025-04-14', choices: [{ message: { content: 'ok' } }], usage }));
    });
  });
  const upPort = await listen(up);
  process.env.UPSTREAM_URL = `http://127.0.0.1:${upPort}`; process.env.PROXY_OPENAI_API_KEY = 'sk-SECRET-should-never-leak';
  const cfg = { ...config(), ...over };
  const { server } = createProxy(cfg); const port = await listen(server);
  const call = (path, body) => fetch(`http://127.0.0.1:${port}/v1/${path}`, { method: 'POST', headers: { authorization: 'Bearer backend-dummy', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ledger = async () => (await fetch(`http://127.0.0.1:${port}/__ledger`)).json();
  return { call, ledger, seen, close: () => { server.close(); up.close(); } };
}
const chat = (o = {}) => ({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'hi' }], ...o });

test('chat-call ceiling: the call after the limit is refused locally and never forwarded', async () => {
  const t = await setup({ maxChat: 3 });
  for (let i = 0; i < 3; i++) assert.equal((await t.call('chat/completions', chat())).status, 200);
  const r = await t.call('chat/completions', chat()); assert.equal(r.status, 429);
  assert.match((await r.json()).error.message, /chat call limit 3/);
  assert.equal(t.seen.bodies.length, 3); // 4th never reached the provider
  const l = await t.ledger(); assert.equal(l.counts.chat, 3); assert.equal(l.refused, 1); t.close();
});

test('embedding ceiling is separate and also enforced', async () => {
  const t = await setup({ maxEmbed: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await t.call('embeddings', { model: 'text-embedding-3-large', input: 'a' })).status, 200);
  assert.equal((await t.call('embeddings', { model: 'text-embedding-3-large', input: 'a' })).status, 429);
  assert.equal((await t.call('chat/completions', chat())).status, 200); t.close();
});

test('dollar ceiling uses measured spend + worst-case reservation, and spend can never exceed it', async () => {
  // each call measures 2000*0.4 + 500*1.6 = $0.0016; worst-case reservation for a tiny prompt ~ 4096 out * 1.6/1e6 = $0.0066
  const t = await setup({ maxUsd: 0.01 });
  let ok = 0, refused = 0;
  for (let i = 0; i < 10; i++) { const r = await t.call('chat/completions', chat()); r.status === 200 ? ok++ : refused++; }
  const l = await t.ledger();
  assert.ok(ok >= 1 && refused >= 1, `ok=${ok} refused=${refused}`);
  assert.ok(l.spentUsd <= 0.01, `spent ${l.spentUsd}`); assert.equal(l.counts.chat, ok); t.close();
});

test('a call that would blow the ceiling on its own is refused before forwarding', async () => {
  const t = await setup({ maxUsd: 0.0001 });
  assert.equal((await t.call('chat/completions', chat({ max_tokens: 2048 }))).status, 429);
  assert.equal(t.seen.bodies.length, 0); t.close();
});

test('concurrency is 1: parallel requests are serialized', async () => {
  const t = await setup({ maxChat: 10 }, 40);
  const rs = await Promise.all([1, 2, 3, 4].map(() => t.call('chat/completions', chat())));
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200, 200]);
  assert.equal(t.seen.maxActive, 1); t.close();
});

test('real key is injected upstream, the backend dummy key is not forwarded, and the key never appears in the ledger', async () => {
  const t = await setup();
  await t.call('chat/completions', chat());
  assert.deepEqual(t.seen.auth, ['Bearer sk-SECRET-should-never-leak']);
  assert.ok(!JSON.stringify(await t.ledger()).includes('SECRET')); t.close();
});

test('ledger records model, measured input/output tokens and cost; streaming gets include_usage', async () => {
  const t = await setup();
  await t.call('chat/completions', chat()); await (await t.call('chat/completions', chat({ stream: true }))).text();
  await t.call('embeddings', { model: 'text-embedding-3-large', input: 'x' });
  assert.equal(t.seen.bodies[1].stream_options.include_usage, true);
  const l = await t.ledger();
  assert.equal(l.inputTokens, 2000 + 2000 + 1000); assert.equal(l.outputTokens, 1000);
  const m = l.byModel['gpt-4.1-mini-2025-04-14']; assert.equal(m.calls, 2);
  assert.ok(Math.abs(m.usd - 2 * (2000 * 0.4 + 500 * 1.6) / 1e6) < 1e-12);       // dated snapshot priced as gpt-4.1-mini
  assert.ok(Math.abs(l.byModel['text-embedding-3-large'].usd - 1000 * 0.13 / 1e6) < 1e-12); t.close();
});

test('a missing max_tokens is capped, unknown routes are not forwarded, unknown models are priced at the priciest', async () => {
  const t = await setup();
  await t.call('chat/completions', chat()); assert.equal(t.seen.bodies[0].max_tokens, 4096);
  assert.equal((await t.call('images/generations', {})).status, 404); assert.equal(t.seen.bodies.length, 1);
  assert.deepEqual(priceOf(config().prices, 'some-future-model'), [2.5, 10]); t.close();
});

test('persisted ledger: a restart cannot reset the call caps, the dollar ceiling or the usage report', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json');
  const first = await setup({ maxChat: 2, ledgerFile: file });
  for (let i = 0; i < 2; i++) assert.equal((await first.call('chat/completions', chat())).status, 200);
  const before = await first.ledger(); first.close();
  assert.ok(existsSync(file)); assert.equal((statSync(file).mode & 0o077), 0, 'ledger file is private to the owner');
  const second = await setup({ maxChat: 2, ledgerFile: file });                      // "restart": a brand-new proxy on the same file
  const reloaded = await second.ledger();
  assert.equal(reloaded.counts.chat, 2); assert.equal(reloaded.spentUsd, before.spentUsd); assert.equal(reloaded.inputTokens, before.inputTokens);
  assert.equal((await second.call('chat/completions', chat())).status, 429);          // cap still holds after the restart
  assert.equal(second.seen.bodies.length, 0, 'nothing was forwarded after the restart');
  second.close();
});

test('persisted ledger: the dollar ceiling holds across a restart', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json');
  const a = await setup({ maxUsd: 0.01, ledgerFile: file });
  while ((await a.call('chat/completions', chat())).status === 200);                  // spend up to the ceiling
  const spent = (await a.ledger()).spentUsd; assert.ok(spent <= 0.01); a.close();
  const b = await setup({ maxUsd: 0.01, ledgerFile: file });
  assert.equal((await b.ledger()).spentUsd, spent);
  assert.equal((await b.call('chat/completions', chat())).status, 429); assert.equal(b.seen.bodies.length, 0); b.close();
});

test('persisted ledger: a corrupt file fails closed instead of starting with an unknown spend', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json'); writeFileSync(file, '{not json');
  assert.throws(() => createProxy({ ...config(), ledgerFile: file }), /unreadable; refusing to start/);
  writeFileSync(file, JSON.stringify({ calls: 'x', refused: 0, spentUsd: 0 }));
  assert.throws(() => createProxy({ ...config(), ledgerFile: file }), /unreadable/);
});

test('the persisted ledger never contains the key, prompts or headers', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json');
  const t = await setup({ ledgerFile: file });
  await t.call('chat/completions', chat({ messages: [{ role: 'user', content: 'PRIVATE-PROMPT-TEXT' }] })); t.close();
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('SECRET') && !raw.includes('PRIVATE-PROMPT-TEXT') && !/authorization/i.test(raw));
});

test('without a key the proxy refuses to forward to the real OpenAI host', async () => {
  const saved = { ...process.env }; delete process.env.PROXY_OPENAI_API_KEY; process.env.UPSTREAM_URL = 'https://api.openai.com';
  const { server } = createProxy(config()); const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', body: JSON.stringify(chat()) });
  assert.equal(r.status, 429); server.close(); Object.assign(process.env, saved);
});
