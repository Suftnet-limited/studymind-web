import test from 'node:test';
import assert from 'node:assert/strict';
import { isJoinCode, joinUrl } from '../src/lib/join-link.ts';

test('the QR/link URL is the public /join/<code> address', () => {
  assert.equal(joinUrl('CIQ-X7K4'), 'https://ciquis.com/join/CIQ-X7K4');
});

test('codes that could break out of the path are encoded', () => {
  assert.equal(joinUrl('a/b?c=d'), 'https://ciquis.com/join/a%2Fb%3Fc%3Dd');
});

test('join codes: generated and legacy course codes pass, junk does not', () => {
  for (const ok of ['CIQ-X7K4', 'ciq-x7k4', 'CSC109', 'a_b-1']) assert.equal(isJoinCode(ok), true, ok);
  for (const bad of ['', 'ab', 'CIQ X7K4', 'CIQ/X7K4', '../x', '<script>', 'a'.repeat(65)]) assert.equal(isJoinCode(bad), false, bad);
});
