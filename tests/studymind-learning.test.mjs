import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, roleCapabilities, apiDetail, parseEntitlements, isUuid, parseModuleInput, parseJoinInput, validateUpload, documentStatus, hasPendingDocuments,
} from '../src/lib/studymind-validation.mjs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const UUID = '123e4567-e89b-12d3-a456-426614174000';

test('isUuid accepts canonical UUIDs only', () => {
  assert.ok(isUuid(UUID));
  for (const bad of ['', 'abc', '../etc/passwd', UUID + '/x', '0'.repeat(36), 42, null]) assert.equal(isUuid(bad), false);
});

test('modules: valid input is trimmed and whitelisted', () => {
  const r = parseModuleInput({ title: '  Biology  ', access_type: 'personal', owner_id: 'attacker', role: 'admin' });
  assert.deepEqual(r, { ok: true, value: { title: 'Biology', access_type: 'personal' } });
});
test('modules: rejects bad titles, access types and non-objects', () => {
  for (const body of [null, [], 'x', {}, { title: 'a', access_type: 'personal' }, { title: ' ', access_type: 'class' },
    { title: 'x'.repeat(256), access_type: 'class' }, { title: 'Ok title', access_type: 'public' }, { title: 5, access_type: 'class' }])
    assert.equal(parseModuleInput(body).ok, false);
});

test('join: accepts UUID (lower-cased) and short course codes', () => {
  assert.deepEqual(parseJoinInput({ course_id: ` ${UUID.toUpperCase()} ` }), { ok: true, value: { course_id: UUID } });
  assert.deepEqual(parseJoinInput({ course_id: 'BIO-101' }), { ok: true, value: { course_id: 'BIO-101' } });
});
test('join: rejects empty, short, long and unsafe Course IDs', () => {
  for (const id of ['', 'ab', 'a'.repeat(65), '../x', 'a b c', 'x;drop', '-abc', 5, undefined])
    assert.equal(parseJoinInput({ course_id: id }).ok, false);
  assert.equal(parseJoinInput(null).ok, false);
});

test('uploads: enforces non-empty and 50 MB limit', () => {
  assert.equal(validateUpload({ size: 0 }).ok, false);
  assert.equal(validateUpload(null).ok, false);
  assert.equal(validateUpload({ size: MAX_UPLOAD_BYTES + 1 }).ok, false);
  assert.equal(validateUpload({ size: MAX_UPLOAD_BYTES }).ok, true);
  assert.equal(validateUpload({ size: 1 }).ok, true);
});

test('uploads: only formats the AI ingestor accepts (PDF, DOCX, TXT, MD, CSV)', () => {
  assert.deepEqual([...ALLOWED_EXTENSIONS].sort(), ['.csv', '.docx', '.md', '.pdf', '.txt']);
  for (const name of ['notes.pdf', 'Essay.DOCX', 'a.b.txt', 'README.md', 'data.csv']) assert.equal(validateUpload({ size: 10, name }).ok, true, name);
  for (const name of ['old.doc', 'slides.pptx', 'run.exe', 'noextension', 'archive.pdf.zip', '.hidden'])
    assert.equal(validateUpload({ size: 10, name }).ok, false, name);
  assert.match(validateUpload({ size: 10, name: 'old.doc' }).error, /PDF, DOCX/);
});

test('roleCapabilities mirrors AI backend rules', () => {
  assert.deepEqual(roleCapabilities('student'), { canCreatePersonal: false, canCreateClass: false, canJoin: true, canUploadClass: false });
  assert.deepEqual(roleCapabilities('self_learner'), { canCreatePersonal: true, canCreateClass: false, canJoin: false, canUploadClass: false });
  assert.deepEqual(roleCapabilities('lecturer'), { canCreatePersonal: true, canCreateClass: true, canJoin: false, canUploadClass: true });
  assert.equal(roleCapabilities('').canJoin, false);
  assert.equal(roleCapabilities('mystery').canCreatePersonal, false);
});

test('apiDetail always yields a readable string (FastAPI detail may be a list)', () => {
  assert.equal(apiDetail({ detail: 'Course ID not found' }, 'x'), 'Course ID not found');
  assert.equal(apiDetail({ detail: [{ loc: ['body', 'course_id'], msg: 'String should have at least 3 characters', type: 'x' }] }, 'x'), 'String should have at least 3 characters');
  for (const bad of [undefined, null, {}, { detail: {} }, { detail: [] }, { detail: [1] }, { detail: '  ' }]) assert.equal(apiDetail(bad, 'fallback'), 'fallback');
  assert.equal(apiDetail({ detail: 'x'.repeat(1000) }, 'f').length, 300);
});

test('documentStatus normalises backend status fields', () => {
  assert.equal(documentStatus({ status: 'Indexed' }), 'indexed');
  assert.equal(documentStatus({ indexing_status: 'queued' }), 'processing');
  assert.equal(documentStatus({ processing_status: 'failed' }), 'failed');
  assert.equal(documentStatus({ chunk_count: 12 }), 'indexed');
  assert.equal(documentStatus({ status: 'failed', chunk_count: 3 }), 'failed');
  assert.equal(documentStatus({}), 'unknown');
  assert.equal(documentStatus(null), 'unknown');
});
test('hasPendingDocuments drives polling', () => {
  assert.equal(hasPendingDocuments([{ status: 'indexed' }, { status: 'processing' }]), true);
  assert.equal(hasPendingDocuments([{ status: 'indexed' }]), false);
  assert.equal(hasPendingDocuments(undefined), false);
});

test('canonical routes use shared validation and never touch the Web database or billing', () => {
  const routes = ['src/app/api/studymind/modules/route.ts', 'src/app/api/studymind/modules/join/route.ts',
    'src/app/api/studymind/modules/[id]/route.ts', 'src/app/api/studymind/modules/[id]/documents/route.ts', 'src/app/api/studymind/auth/register/route.ts', 'src/app/api/studymind/auth/config/route.ts'];
  for (const r of routes) {
    const src = read(r);
    assert.doesNotMatch(src, /@\/lib\/prisma|prisma\./, `${r} must not use Prisma`);
    assert.doesNotMatch(src, /stripe|billing/i, `${r} must not touch payments`);
  }
  assert.match(read('src/app/api/studymind/modules/join/route.ts'), /parseJoinInput/);
  assert.match(read('src/app/api/studymind/modules/route.ts'), /parseModuleInput/);
  assert.match(read('src/app/api/studymind/modules/[id]/documents/route.ts'), /validateUpload/);
});

test('auth: tokens stay in httpOnly cookies and registration does not auto-link Web accounts', () => {
  const id = read('src/lib/studymind-identity.ts');
  assert.match(id, /httpOnly:\s*true/);
  assert.match(id, /sameSite:\s*'lax'/);
  assert.match(id, /Invalid StudyMind API route/);
  const reg = read('src/app/api/studymind/auth/register/route.ts');
  assert.match(reg, /password\.length < 12/);
  assert.match(reg, /\['student', 'lecturer', 'self_learner'\]/);
  assert.doesNotMatch(reg, /findUnique|findFirst|upsert/);
});

test('client pages do not use Mobile purchases or expose tokens', () => {
  for (const p of ['src/app/my-learning/page.tsx', 'src/app/my-learning/modules/[id]/page.tsx', 'src/services/studymind-modules.service.ts']) {
    const src = read(p);
    assert.doesNotMatch(src, /localStorage|sessionStorage|access_token/, `${p} must not handle tokens`);
    assert.doesNotMatch(src, /in-?app.?purchase|revenuecat/i);
  }
});

test('parseEntitlements normalises the allowance API and never invents data', () => {
  const full = parseEntitlements({ plan: 'StudyMind Plus', expires_at: '2026-12-01T00:00:00Z', allowances: {
    chats: { limit: 200, remaining: 150 }, quiz: { limit: 30, used: 5 }, flashcards: { limit: 30, remaining: 99 }, summary: { limit: 15, remaining: -2 } } });
  assert.equal(full.plan, 'plus');
  assert.equal(full.expires_at, '2026-12-01T00:00:00Z');
  assert.deepEqual(full.allowances.chats, { limit: 200, remaining: 150 });
  assert.deepEqual(full.allowances.quizzes, { limit: 30, remaining: 25 });
  assert.deepEqual(full.allowances.flashcards, { limit: 30, remaining: 30 }, 'remaining is clamped to the limit');
  assert.deepEqual(full.allowances.summaries, { limit: 15, remaining: 0 }, 'remaining is clamped to zero');
  assert.equal(parseEntitlements({ plan: 'free', allowances: { chats: { limit: 10, remaining: 1 } } }).plan, 'free');
  for (const bad of [null, undefined, 'x', [], {}, { allowances: {} }, { allowances: { chats: { limit: 'ten' } } }, { allowances: { chats: { remaining: 3 } } }])
    assert.equal(parseEntitlements(bad), null);
});

test('plans presentation matches the agreed pricing and has no purchase flow', () => {
  const plans = read('src/lib/plans.ts');
  assert.match(plans, /chats: 10, quizzes: 2, flashcards: 2, summaries: 1/);
  assert.match(plans, /£3\.99/); assert.match(plans, /for 28 days/);
  assert.match(plans, /chats: 200, quizzes: 30, flashcards: 30, summaries: 15/);
  const page = read('src/app/my-learning/plans/page.tsx');
  assert.match(page, /Pricing preview/);
  assert.doesNotMatch(page, /checkout|stripe|<Button|<form|onSubmit/i, 'plans page must not contain a purchase flow');
  const route = read('src/app/api/studymind/entitlements/route.ts');
  assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE|stripe|prisma/i, 'entitlement route must be read-only');
});
