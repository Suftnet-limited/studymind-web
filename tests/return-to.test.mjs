import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, withNext } from '../src/lib/return-to.ts';

test('accepts same-site paths inside /my-learning/', () => {
  assert.equal(safeNext('/my-learning/join/CIQ-X7K4'), '/my-learning/join/CIQ-X7K4');
  assert.equal(safeNext('/my-learning/modules/abc?tab=docs'), '/my-learning/modules/abc?tab=docs');
});

test('rejects anything that could leave the site or the learning area', () => {
  for (const bad of [
    null, undefined, '', '/', '/my-learning', '/dashboard', '/my-learning-evil/x', 'my-learning/x',
    'https://evil.com/my-learning/x', '//evil.com/my-learning/x', '/my-learning//evil.com', '/my-learning/\\evil.com',
    '/my-learning/../dashboard', '/my-learning/%2e%2e/../x', 'javascript:alert(1)', '/my-learning/x\n', '/my-learning/' + 'a'.repeat(600),
  ]) assert.equal(safeNext(bad), null, String(bad));
});

test('withNext keeps the destination across the sign-in / register switch', () => {
  assert.equal(withNext('/my-learning/register', '/my-learning/join/CIQ-X7K4'), '/my-learning/register?next=%2Fmy-learning%2Fjoin%2FCIQ-X7K4');
  assert.equal(withNext('/my-learning', null), '/my-learning');
});
