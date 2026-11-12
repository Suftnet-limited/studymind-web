import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import {
  parseTopic, parseChatInput, parseQuizInput, parseFlashcardInput, parseSummaryInput, parseQuizSubmit,
  toChatRequest, toQuizRequest, toFlashcardRequest, toSummaryRequest,
  mapChat, mapQuizGenerated, mapQuizResult, mapFlashcards, mapSummary, aiFailure, LIMITS,
} from '../src/lib/learning-ai.mjs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MODULE = '123e4567-e89b-12d3-a456-426614174000';
const QID = '223e4567-e89b-12d3-a456-426614174001';

test('chat input: trims, requires a question, bounds length, validates session and complexity', () => {
  assert.deepEqual(parseChatInput({ message: '  What is F = m a?  ' }), { ok: true, value: { message: 'What is F = m a?', session_id: undefined, complexity: 'normal', scope_mode: 'everything' } });
  assert.equal(parseChatInput({ message: 'hi', complexity: 'expert', session_id: MODULE }).ok, true);
  for (const bad of [null, [], 'x', {}, { message: '   ' }, { message: 5 }, { message: 'x'.repeat(LIMITS.message + 1) }, { message: 'ok', complexity: 'genius' }, { message: 'ok', session_id: 'nope' }, { message: 'ok', session_id: 7 }])
    assert.equal(parseChatInput(bad).ok, false, JSON.stringify(bad)?.slice(0, 60));
});
test('quiz, flashcard and summary inputs: defaults, ranges and topic rules match the AI schemas', () => {
  assert.deepEqual(parseQuizInput(undefined), { ok: true, value: { topic: undefined, question_count: 5 } });
  assert.equal(parseQuizInput({ question_count: 4 }).ok, false); assert.equal(parseQuizInput({ question_count: 21 }).ok, false); assert.equal(parseQuizInput({ question_count: 5.5 }).ok, false);
  assert.equal(parseFlashcardInput({ max_cards: 4 }).ok, false); assert.equal(parseFlashcardInput({ max_cards: 51 }).ok, false); assert.equal(parseFlashcardInput({}).value.max_cards, 20);
  assert.deepEqual(parseTopic('  Cells '), { ok: true, value: 'Cells' }); assert.deepEqual(parseTopic('   '), { ok: true, value: undefined });
  assert.equal(parseTopic('x'.repeat(201)).ok, false); assert.equal(parseTopic(5).ok, false);
  assert.equal(parseSummaryInput('nope').ok, false); assert.equal(parseSummaryInput({ topic: 'Energy' }).value.topic, 'Energy');
});
test('quiz submission: option ids as answers, uuid question ids, no duplicates', () => {
  assert.deepEqual(parseQuizSubmit({ answers: [{ question_id: QID.toUpperCase(), answer: 'b' }] }), { ok: true, value: { answers: [{ question_id: QID, answer: 'b' }] } });
  for (const bad of [null, {}, { answers: [] }, { answers: [{ question_id: 'x', answer: 'a' }] }, { answers: [{ question_id: QID, answer: '' }] }, { answers: [{ question_id: QID, answer: 'a' }, { question_id: QID, answer: 'b' }] },
    { answers: Array.from({ length: 31 }, (_, i) => ({ question_id: `223e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, '0')}`, answer: 'a' })) }])
    assert.equal(parseQuizSubmit(bad).ok, false);
});

test('AI requests are built from the URL module id; browser-supplied identity or module fields are never forwarded', () => {
  const evil = { message: 'hi', complexity: 'normal', module_id: 'OTHER', user_id: 'victim', role: 'admin', scope_mode: 'class_only' };
  const parsed = parseChatInput(evil); assert.equal(parsed.ok, true);
  const req = toChatRequest(MODULE, parsed.value);
  // The source selection is a whitelisted choice (only the default, class-only or own-notes-only: it can narrow, never widen; the AI
  // backend still authorises every request). Identity, role and module fields from the browser are never forwarded.
  assert.deepEqual(req, { module_id: MODULE, message: 'hi', complexity: 'normal', scope_mode: 'class_only' });
  assert.ok(!('user_id' in req) && !('role' in req));
  assert.equal(parseChatInput({ ...evil, scope_mode: 'all_semesters' }).ok, false, 'scopes outside the public three are refused');
  assert.deepEqual(toQuizRequest(MODULE, { question_count: 5, topic: 'Cells' }), { module_id: MODULE, question_count: 5, question_type: 'mcq', topic: 'Cells' });
  assert.deepEqual(toQuizRequest(MODULE, { question_count: 5 }), { module_id: MODULE, question_count: 5, question_type: 'mcq' });
  assert.deepEqual(toFlashcardRequest(MODULE, { max_cards: 10 }), { module_id: MODULE, max_cards: 10 });
  assert.equal(toFlashcardRequest(MODULE, { max_cards: 10, topic: 'DNA' }).title, 'Flashcards: DNA');
  assert.deepEqual(toSummaryRequest(MODULE, {}), { module_id: MODULE, scope: 'module' });
  for (const body of [toChatRequest(MODULE, parsed.value), toQuizRequest(MODULE, { question_count: 5 }), toFlashcardRequest(MODULE, { max_cards: 5 }), toSummaryRequest(MODULE, {})])
    assert.equal(body.module_id, MODULE);
});

test('chat response: de-duplicates citations, keeps snippets, flags empty retrieval, drops unknown fields', () => {
  const raw = { answer: 'F = m a', session_id: 's1', message_id: 'm1', latency_ms: 5, token_count: 9, internal: 'x', no_content_found: false, suggestions: ['Try class material'],
    sources: [{ document_id: 'd1', filename: 'physics.pdf', chunk_index: 0, content_snippet: 'F = m a', relevance_score: 0.9 }, { document_id: 'd1', filename: 'physics.pdf', chunk_index: 1, content_snippet: 'dup', relevance_score: 0.5 }, { filename: 'bio.docx', content_snippet: 'x' }],
    scope: { description: 'Physics · all' } };
  const out = mapChat(raw);
  assert.equal(out.sources.length, 2); assert.equal(out.sources[0].snippet, 'F = m a'); assert.equal(out.scope, 'Physics · all');
  assert.ok(!('latency_ms' in out) && !('internal' in out) && !('token_count' in out));
  assert.equal(mapChat({ answer: 'x', no_content_found: true }).no_content_found, true);
  assert.equal(mapChat(null), null); assert.equal(mapChat({ answer: 5 }), null);
});
test('quiz: generated questions hide answers; the submitted result reveals correctness and explanations', () => {
  const generated = mapQuizGenerated({ id: 'a1', title: 'Quiz', question_count: 2, questions: [
    { id: 'q2', position: 2, question: 'Two?', options: [{ id: 'a', text: 'A' }], correct_answer: 'a', explanation: 'secret', source_chunk: 'chunk', student_answer: null },
    { id: 'q1', position: 1, question: 'One?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct_answer: 'b', explanation: 'because', source_chunk: 'c' }] });
  assert.deepEqual(generated.questions.map((q) => q.id), ['q1', 'q2'], 'sorted by position');
  const leaked = JSON.stringify(generated);
  for (const word of ['correct_answer', 'explanation', 'secret', 'source_chunk', 'because']) assert.ok(!leaked.includes(word), `${word} must not reach the browser before submission`);
  const result = mapQuizResult({ attempt_id: 'a1', score: 50, total: 2, correct: 1, questions: [{ id: 'q1', position: 1, question: 'One?', options: [{ id: 'a', text: 'A' }], correct_answer: 'b', explanation: 'because', student_answer: 'a', is_correct: false }] });
  assert.equal(result.questions[0].explanation, 'because'); assert.equal(result.questions[0].is_correct, false); assert.equal(result.score, 50);
  assert.equal(mapQuizGenerated({}), null); assert.equal(mapQuizResult(null), null);
});
test('flashcards and summary are mapped to clean shapes', () => {
  const deck = mapFlashcards({ id: 'd1', title: 'T', card_count: 2, mastered_count: 0, cards: [{ id: 'c2', position: 2, front: 'F2', back: 'B2', status: 'new', source_chunk: 'x' }, { id: 'c1', position: 1, front: 'F1', back: 'B1' }, { id: 'bad' }] });
  assert.deepEqual(deck.cards.map((c) => c.front), ['F1', 'F2']); assert.ok(!JSON.stringify(deck).includes('source_chunk'));
  assert.equal(mapFlashcards({ id: 'd', cards: 'x' }), null);
  assert.equal(mapSummary({ id: 's', content: '## Title', source_doc_count: 3, created_at: '2026-01-01T00:00:00Z' }).source_doc_count, 3);
  assert.equal(mapSummary({ content: '   ' }), null);
});
test('AI failures are mapped to safe messages; upstream bodies and 5xx details are never forwarded', () => {
  assert.equal(aiFailure(403, null).status, 403); assert.equal(aiFailure(404, null).status, 404); assert.equal(aiFailure(401, null).status, 401);
  assert.equal(aiFailure(429, null).status, 429); assert.equal(aiFailure(402, null).status, 429);
  assert.match(aiFailure(422, { detail: 'No documents found for this module' }).error, /No documents found/);
  assert.match(aiFailure(422, { detail: [{ msg: 'x' }] }).error, /indexed study material/);
  for (const internal of ['LLM returned invalid JSON: Expecting value: line 1 column 1 (char 0)', 'Traceback in app/agents/ai_features.py', 'validation error for QuizGenerateRequest'])
    assert.doesNotMatch(aiFailure(422, { detail: internal }).error, /LLM|JSON|Traceback|ai_features|QuizGenerate/, internal);
  assert.match(aiFailure(422, { detail: 'No content found to summarise. Upload materials first.' }).error, /Upload materials first/);
  for (const status of [500, 502, 503, 504]) {
    const f = aiFailure(status, { detail: 'Incorrect API key provided: sk-live-abc123 Traceback (most recent call last)' });
    assert.equal(f.status, 502); assert.ok(!/sk-|traceback|api key/i.test(f.error), f.error);
  }
});

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = `${dir}/${n}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
test('security: no platform API key in browser code, no browser-supplied user id, no direct AI calls from the browser', () => {
  const root = new URL('../', import.meta.url).pathname;
  const ui = walk(`${root}src/components/learning/ai`).concat(`${root}src/services/studymind-ai.service.ts`).map((f) => [f, readFileSync(f, 'utf8')]);
  for (const [f, src] of ui) {
    assert.doesNotMatch(src, /NEXT_PUBLIC_STUDYMIND|STUDYMIND_AI_PLATFORM_API_KEY|X-API-Key|localStorage|sessionStorage|access_token|user_id|userId|api\.aismartlearner/i, `${f} must not handle keys, tokens or user ids`);
    assert.doesNotMatch(src, /\/api\/v1\//, `${f} must use the canonical authenticated API, not the platform /api/v1 API`);
  }
  assert.doesNotMatch(read('src/lib/learning-ai-proxy.ts'), /STUDYMIND_AI_PLATFORM_API_KEY|user_id|userId/);
  assert.doesNotMatch(read('src/lib/learning-ai.mjs'), /user_id|userId/);
  assert.doesNotMatch(read('package.json'), /@studymind\/react/);
  assert.equal(readFileSync(new URL('../.env.example', import.meta.url), 'utf8').includes('NEXT_PUBLIC_STUDYMIND'), false);
});
test('security: every AI route goes through the shared guard (auth, module access, validation) and uses the canonical allow-list', () => {
  const base = 'src/app/api/studymind/modules/[id]/ai';
  const routes = ['chat/route.ts', 'quiz/route.ts', 'quiz/[attemptId]/route.ts', 'flashcards/route.ts', 'summary/route.ts'];
  for (const r of routes) { const src = read(`${base}/${r}`); assert.match(src, /aiRoute\(/, r); assert.doesNotMatch(src, /authenticatedAiFetch|fetch\(/, `${r} must not call the AI directly`); assert.match(src, /export const POST/); assert.doesNotMatch(src, /export (async )?function (GET|PUT|PATCH|DELETE)/); }
  const proxy = read('src/lib/learning-ai-proxy.ts');
  assert.match(proxy, /requireModuleAccess\(id\)/); assert.match(proxy, /isUuid\(id\)/);
  assert.ok(proxy.indexOf('requireModuleAccess(id)') < proxy.indexOf('spec.path('), 'module access must be checked before any AI request');
  const identity = read('src/lib/studymind-identity.ts');
  assert.match(identity, /LEARNING_PATH/); assert.match(identity, /chat\$/); assert.match(identity, /summarise\$/);
  assert.doesNotMatch(identity, /\\\/api\\\/\(\.\*\)/, 'the allow-list must not be a wildcard');
});
