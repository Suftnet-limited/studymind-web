import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecaptchaToken } from '../src/lib/recaptcha-client.ts';

test('returns the token from reCAPTCHA', async () => assert.equal(await getRecaptchaToken(async (a) => `tok-${a}`, 'login'), 'tok-login'));
test('script not loaded / blocked (no execute function): empty token, the form still submits', async () => assert.equal(await getRecaptchaToken(undefined, 'login'), ''));
test('invalid site key (execute throws): empty token instead of an exception that stops the request', async () => {
  assert.equal(await getRecaptchaToken(async () => { throw new Error('Invalid site key or not loaded in api.js: abc'); }, 'register'), '');
});
test('a hung reCAPTCHA call is abandoned after the timeout', async () => {
  const t0 = Date.now();
  assert.equal(await getRecaptchaToken(() => new Promise(() => {}), 'login', 50), '');
  assert.ok(Date.now() - t0 < 1500);
});
