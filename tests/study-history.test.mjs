import test from 'node:test';
import assert from 'node:assert/strict';
import { mapHistoryList, mapQuizDetail, mapFlashcardDetail, mapSummaryDetail } from '../src/lib/learning-ai.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const question = (n, extra = {}) => ({ id: id(100 + n), position: n, question: `Q${n}`, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct_answer: 'b', explanation: 'because', source_chunk: 'internal chunk', student_answer: null, is_correct: null, ...extra });

test('quiz list: newest first, display fields only, score only once submitted', () => {
  const rows = mapHistoryList('quiz', [
    { id: id(1), title: 'Quiz: A', question_count: 5, answered_count: 2, status: 'generated', created_at: '2026-01-01T10:00:00Z', module_id: id(9), user_id: id(8) },
    { id: id(2), title: 'Quiz: B', question_count: 5, answered_count: 5, score: 80, status: 'submitted', created_at: '2026-01-02T10:00:00Z' },
    { id: 'not-a-uuid', title: 'bad' }, null,
  ]);
  assert.deepEqual(rows.map((r) => r.id), [id(2), id(1)]);
  assert.equal(rows[0].detail, '5 questions · Score 80%'); assert.equal(rows[1].detail, '5 questions · 2 answered');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['completed', 'created_at', 'detail', 'id', 'title']);
});
test('flashcard and summary lists derive a readable title and caps at 50', () => {
  assert.equal(mapHistoryList('flashcards', [{ id: id(1), title: 'Flashcards: Newton', card_count: 1, created_at: '2026-01-01T00:00:00Z', cards: [{ front: 'x' }] }])[0].detail, '1 card');
  const s = mapHistoryList('summary', [{ id: id(1), content: '## **Summary: Momentum**\n\n- one', source_doc_count: 2, created_at: '2026-01-01T00:00:00Z' }])[0];
  assert.equal(s.title, 'Summary: Momentum'); assert.equal(s.detail, '2 documents');
  assert.equal(mapHistoryList('summary', Array.from({ length: 80 }, (_, i) => ({ id: id(i + 1), content: 'x', created_at: '2026-01-01T00:00:00Z' }))).length, 50);
});
test('an unfinished quiz never carries answers or explanations; a submitted one does', () => {
  const open = mapQuizDetail({ id: id(1), status: 'generated', created_at: '2026-01-01T00:00:00Z', questions: [question(1, { student_answer: 'a' }), question(2)] });
  assert.equal(open.status, 'in_progress'); assert.equal(open.result, null); assert.deepEqual(open.answers, { [id(101)]: 'a' });
  const text = JSON.stringify(open);
  for (const w of ['correct_answer', 'explanation', 'source_chunk', 'is_correct', 'because']) assert.ok(!text.includes(w), w);
  const done = mapQuizDetail({ id: id(1), status: 'submitted', score: 50, questions: [question(1, { student_answer: 'b', is_correct: true }), question(2, { student_answer: 'a', is_correct: false })] });
  assert.equal(done.status, 'submitted'); assert.equal(done.result.correct, 1); assert.equal(done.result.total, 2); assert.equal(done.result.score, 50);
  assert.equal(done.result.questions[0].explanation, 'because'); assert.ok(!JSON.stringify(done).includes('internal chunk'));
});
test('flashcard and summary details expose only whitelisted fields; malformed input is rejected', () => {
  const d = mapFlashcardDetail({ id: id(1), title: 'T', user_id: id(7), cards: [{ id: id(5), position: 1, front: 'f', back: 'b', source_chunk: 'secret', status: 'new' }] });
  assert.ok(!JSON.stringify(d).includes('secret') && !JSON.stringify(d).includes(id(7)));
  const s = mapSummaryDetail({ id: id(1), content: '## S\n\nbody\n\n## General study advice\n\ntip', user_id: id(7), source_doc_count: 1, created_at: '2026-01-01T00:00:00Z' });
  assert.equal(s.summary.advice, 'tip'); assert.ok(!JSON.stringify(s).includes(id(7)));
  assert.equal(mapQuizDetail({ id: 'x' }), null); assert.equal(mapFlashcardDetail(null), null); assert.equal(mapSummaryDetail({ id: 'x', content: '  ' }), null);
});

import { mapOutline } from '../src/lib/learning-ai.mjs';
test('topic suggestions: weeks in order, indexed latest documents only, titles only, deduplicated and capped', () => {
  const o = mapOutline(
    [{ id: id(1), module_id: id(9), week_number: 2, title: ' Energy  and work ', created_at: 'x' }, { week_number: 1, title: 'Forces' }, { week_number: 3, title: '' }, null, { week_number: 4, title: 'forces' }],
    [{ id: id(2), filename: 'Cell-Biology.pdf', status: 'indexed', is_latest: true, user_id: id(7) }, { filename: 'old.pdf', status: 'indexed', is_latest: false }, { filename: 'pending.pdf', status: 'processing', chunk_count: 0 },
      { filename: 'chunks.txt', status: 'unknown', chunk_count: 3 }, { filename: 'Forces.docx', status: 'indexed' }]);
  assert.deepEqual(o.weeks, [{ label: 'Week 1: Forces', value: 'Forces' }, { label: 'Week 2: Energy and work', value: 'Energy and work' }]);
  assert.deepEqual(o.documents.map((d) => d.value), ['Cell-Biology', 'chunks']);          // 'Forces.docx' duplicates the week title; old/pending excluded
  assert.ok(!JSON.stringify(o).includes(id(9)) && !JSON.stringify(o).includes(id(7)));
  assert.deepEqual(mapOutline(null, 'x'), { weeks: [], documents: [] });
  assert.equal(mapOutline(Array.from({ length: 90 }, (_, i) => ({ week_number: i + 1, title: `W${i}` })), []).weeks.length, 60);
});
