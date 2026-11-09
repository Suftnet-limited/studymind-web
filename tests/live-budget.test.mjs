import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { LiveBudget, BudgetError, AGREED } from './live/live-budget.mjs';
import { createProxy, config } from './fixtures/openai-budget-proxy.mjs';

const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
async function proxy(over = {}) {
  const { server } = createProxy({ ...config(), ...over });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test('agreed limits are 20 generations, 5 uploads, $5, concurrency 1, and the proxy default is the $5 ceiling', () => {
  assert.deepEqual(AGREED, { maxGenerations: 20, maxUploads: 5, maxUsd: 5, concurrency: 1 });
  assert.equal(config().maxUsd, 5);
});

test('generation 21 and upload 6 are refused without running the callback', async () => {
  const p = await proxy(); const b = await LiveBudget.start({ proxyUrl: p.url }); let ran = 0;
  for (let i = 0; i < 20; i++) await b.generation(async () => { ran++; });
  await assert.rejects(() => b.generation(async () => { ran++; }), /generation limit of 20/);
  assert.equal(ran, 20);
  let up = 0;
  for (let i = 0; i < 5; i++) await b.upload(async () => { up++; });
  await assert.rejects(() => b.upload(async () => { up++; }), (e) => e instanceof BudgetError && /upload limit of 5/.test(e.message));
  assert.equal(up, 5); p.close();
});

test('a FAILED generation still consumes allowance (retries cannot sneak past the cap)', async () => {
  const p = await proxy(); const b = await LiveBudget.start({ proxyUrl: p.url, limits: { ...AGREED, maxGenerations: 2 } });
  await assert.rejects(() => b.generation(async () => { throw new Error('boom'); }), /boom/);
  await assert.rejects(() => b.generation(async () => { throw new Error('boom'); }), /boom/);
  await assert.rejects(() => b.generation(async () => 'x'), /limit of 2/); p.close();
});

test('calls run one at a time even when issued in parallel', async () => {
  const p = await proxy(); const b = await LiveBudget.start({ proxyUrl: p.url }); let active = 0, max = 0;
  await Promise.all([1, 2, 3, 4].map(() => b.generation(async () => {
    active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 15)); active--;
  })));
  assert.equal(max, 1); p.close();
});

test('FAIL CLOSED: refuses to start when the proxy is down, too loose, or the ledger is dirty', async () => {
  await assert.rejects(() => LiveBudget.start({ proxyUrl: 'http://127.0.0.1:9' }), /not reachable/);
  await assert.rejects(() => LiveBudget.start({}), /no budget proxy/);
  const loose = await proxy({ maxUsd: 50 });
  await assert.rejects(() => LiveBudget.start({ proxyUrl: loose.url }), /above the agreed \$5/); loose.close();

  const up = http.createServer((q, r) => {
    q.resume(); q.on('end', () => { r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ model: 'gpt-4.1-mini', choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } })); });
  });
  const upPort = await listen(up);
  const dirty = await proxy({ upstream: new URL(`http://127.0.0.1:${upPort}`), key: 'k' });
  await fetch(`${dirty.url}/v1/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [] }) });
  await assert.rejects(() => LiveBudget.start({ proxyUrl: dirty.url }), /ledger is not empty/);
  dirty.close(); up.close();
});

test('FAIL CLOSED end to end: with no key the proxy refuses to forward to api.openai.com, so nothing can be spent', async () => {
  const p = await proxy({ key: '', upstream: new URL('https://api.openai.com') });
  const r = await fetch(`${p.url}/v1/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [] }) });
  assert.equal(r.status, 429);
  const l = await (await fetch(`${p.url}/__ledger`)).json();
  assert.equal(l.counts.chat, 0); p.close();
});
