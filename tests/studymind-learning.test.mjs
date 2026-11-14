import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, roleCapabilities, apiDetail, parseUploadVisibility, parseEntitlements, isUuid, parseModuleInput, parseJoinInput, validateUpload, documentStatus, hasPendingDocuments,
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
  assert.deepEqual(roleCapabilities('student'), { canCreatePersonal: true, canCreateClass: false, canJoin: true, canUploadClass: false });
  assert.deepEqual(roleCapabilities('self_learner'), { canCreatePersonal: true, canCreateClass: false, canJoin: true, canUploadClass: false });
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

test('plans presentation matches the agreed pricing; the only purchase path is the server-side Checkout route', () => {
  const plans = read('src/lib/plans.ts');
  assert.match(plans, /chats: 10, quizzes: 2, flashcards: 2, summaries: 1/);
  assert.match(plans, /£3\.99/); assert.match(plans, /for 28 days/);
  assert.match(plans, /chats: 200, quizzes: 30, flashcards: 30, summaries: 15/);
  const page = read('src/app/my-learning/plans/page.tsx');
  assert.match(page, /Pricing preview/, 'the preview wording stays whenever the backend reports checkout as unavailable');
  assert.match(page, /Coming soon — purchases are not available yet\./);
  assert.match(page, /Get Plus — £3\.99/);
  assert.doesNotMatch(page, /from 'stripe'|STRIPE_|prisma|stripe\.com|sk_(test|live)|pk_(test|live)/i, 'the browser page never touches Stripe or secrets');
  const writes = [...page.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]).filter((c) => /POST/.test(c));
  assert.equal(writes.length, 1, 'exactly one write from the page');
  assert.match(writes[0], /\/api\/studymind\/checkout/, 'and it is the Checkout route');
  assert.match(page, /purchase_available|purchaseAvailable/, 'the button is shown only when the backend says checkout is available');
  const route = read('src/app/api/studymind/entitlements/route.ts');
  assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE|stripe|prisma/i, 'entitlement route must be read-only');
  const checkout = read('src/app/api/studymind/checkout/route.ts');
  assert.doesNotMatch(checkout, /request\.(json|formData|text|arrayBuffer)\(|from 'stripe'|prisma/, 'the checkout route reads nothing from the browser body and never grants access');
  assert.match(checkout, /isCrossSite\(request\)/); assert.match(checkout, /checkout\\\.stripe\\\.com/);
});

test('parseEntitlements reports checkout availability only when the backend says so', () => {
  const real = { plan: 'free', expires_at: null, allowances: { chats: { limit: 10, remaining: 7 } } };
  assert.equal(parseEntitlements(real).purchase_available, false);
  assert.equal(parseEntitlements({ ...real, purchase_available: true }).purchase_available, true);
  assert.equal(parseEntitlements({ ...real, purchase_available: 'true' }).purchase_available, false);
});

test('parseEntitlements keeps the backend enforcement flag and the real backend response shape', () => {
  const real = { plan: 'free', expires_at: null, features: { chat: { limit: 10, used: 3, remaining: 7 } },
    allowances: { chats: { limit: 10, remaining: 7 }, quizzes: { limit: 2, remaining: 2 }, flashcards: { limit: 2, remaining: 2 }, summaries: { limit: 1, remaining: 1 } },
    enforcement_enabled: false };
  const parsed = parseEntitlements(real);
  assert.equal(parsed.enforcement_enabled, false);
  assert.equal(parsed.plan, 'free');
  assert.deepEqual(parsed.allowances.chats, { limit: 10, remaining: 7 });
  assert.equal(parseEntitlements({ ...real, enforcement_enabled: true }).enforcement_enabled, true);
  assert.equal(parseEntitlements({ ...real, enforcement_enabled: 'yes' }).enforcement_enabled, null);
  assert.equal(Object.keys(parsed).includes('features'), false, 'internal feature map is not forwarded');
});

test('header links to the canonical journey and the global link reset cannot override Tailwind colours', () => {
  const layout = read('src/app/layout.tsx');
  const header = read('src/components/site-header.tsx');
  assert.match(header, /href="\/my-learning">Sign in/); assert.match(header, /href="\/my-learning\/register">Get started/);
  assert.match(header, /bg-violet-600[^"]*text-white[^"]*"[^>]*href="\/my-learning\/register"/, 'Get started keeps its contrast classes');
  assert.doesNotMatch(layout + header, /href="\/sign-up"/);
  // A signed-in StudyMind AI user must not be shown Sign in / Get started: the server hint comes from the session cookies
  // and the header confirms it through the status route.
  assert.match(layout, /<SiteHeader[^\n]*initialSignedIn=\{hasAiSession\}\/>/);
  assert.match(layout, /studymind_ai_access/); assert.match(layout, /studymind_ai_refresh/);
  assert.match(header, /else if \(signedIn\)/); assert.match(header, /href: '\/my-learning', label: 'Dashboard'/); assert.match(header, /aria-label="Account menu"/);
  assert.match(header, /\/api\/studymind\/auth\/status/); assert.match(header, /studymind-auth-changed/);
  assert.doesNotMatch(read('src/app/api/studymind/auth/status/route.ts'), /access_token|refresh_token|email/, 'status route must not expose tokens or emails');
  assert.match(read('src/app/globals.css'), /@layer base\{a\{[^}]*\}\}/);
  assert.match(read('src/app/my-learning/page.tsx'), /href="\/sign-in"/, 'legacy Web accounts keep a way in');
});

test('upload visibility: defaults to personal (least privilege) and rejects unknown values', () => {
  assert.equal(parseUploadVisibility('class'), 'class');
  assert.equal(parseUploadVisibility('personal'), 'personal');
  for (const missing of [undefined, null, '']) assert.equal(parseUploadVisibility(missing), 'personal');
  for (const bad of ['public', 'CLASS', 'class ', 'institution', 0, {}, ['class']]) assert.equal(parseUploadVisibility(bad), null, String(bad));
});

test('Web document routes: no delete/read-by-id paths and uploads use the AI query parameters', () => {
  const fs = readFileSync;
  const route = read('src/app/api/studymind/modules/[id]/documents/route.ts');
  assert.doesNotMatch(route, /export async function (DELETE|PUT|PATCH)/);
  assert.match(route, /query\.set\('visibility'/); assert.doesNotMatch(route, /payload\.set\('visibility'/);
  assert.match(route, /parseUploadVisibility/);
  assert.equal(typeof fs, 'function');
});
