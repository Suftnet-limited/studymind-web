import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecaptcha } from '../src/lib/recaptcha.ts';

const realFetch = globalThis.fetch;
const realSecret = process.env.RECAPTCHA_SECRET_KEY;
test.afterEach(() => { globalThis.fetch = realFetch; if (realSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY; else process.env.RECAPTCHA_SECRET_KEY = realSecret; });

const google = (body, init = {}) => { const calls = []; globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response(JSON.stringify(body), { status: 200, ...init }); }; return calls; };

test('no secret configured: verification is skipped (local dev / tests) and Google is never called', async () => {
  delete process.env.RECAPTCHA_SECRET_KEY;
  globalThis.fetch = async () => { throw new Error('must not be called'); };
  assert.equal(await verifyRecaptcha(''), true);
  assert.equal(await verifyRecaptcha('anything'), true);
});

test('secret configured but no token: rejected without calling Google', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 'real-secret';
  globalThis.fetch = async () => { throw new Error('must not be called'); };
  assert.equal(await verifyRecaptcha(''), false);
});

test('a token cannot inject a second "secret" parameter (parameter-injection bypass)', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 'real-secret';
  const calls = google({ success: true, score: 0.9 });
  await verifyRecaptcha('their-token&secret=their-own-secret');
  const sent = new URLSearchParams(String(calls[0].opts.body));
  assert.deepEqual(sent.getAll('secret'), ['real-secret']);
  assert.equal(sent.get('response'), 'their-token&secret=their-own-secret');
});

test('score decides: human passes, bot fails, unsuccessful or score-less responses fail', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 's';
  google({ success: true, score: 0.9 }); assert.equal(await verifyRecaptcha('t'), true);
  google({ success: true, score: 0.5 }); assert.equal(await verifyRecaptcha('t'), true);
  google({ success: true, score: 0.2 }); assert.equal(await verifyRecaptcha('t'), false);
  google({ success: false, score: 0.9 }); assert.equal(await verifyRecaptcha('t'), false);
  google({ success: true }); assert.equal(await verifyRecaptcha('t'), false);
});

test('Google unreachable, erroring or returning junk fails closed instead of throwing', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 's';
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  assert.equal(await verifyRecaptcha('t'), false);
  google({ error: 'nope' }, { status: 503 }); assert.equal(await verifyRecaptcha('t'), false);
  globalThis.fetch = async () => new Response('<html>not json</html>', { status: 200 });
  assert.equal(await verifyRecaptcha('t'), false);
});
