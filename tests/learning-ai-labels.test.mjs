// Tutor grounding labels and summary/advice separation (pure mapping logic).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapChat, mapSummary, splitSummary } from '../src/lib/learning-ai.mjs';

const src = (f) => ({ filename: f, content_snippet: 'snippet', document_id: 'd1' });
const chat = (o) => mapChat({ answer: 'A', session_id: 's', message_id: 'm', sources: [], no_content_found: false, ...o });

test('grounded answer: retrieved sources are kept and flagged grounded', () => {
  const r = chat({ sources: [src('bio.docx')] });
  assert.equal(r.grounded, true); assert.deepEqual(r.sources.map((s) => s.filename), ['bio.docx']);
});

test('ungrounded answer (nothing retrieved) is flagged and has no citations', () => {
  const r = chat({ no_content_found: true });
  assert.equal(r.grounded, false); assert.deepEqual(r.sources, []);
});

test('citations are NEVER attached to an ungrounded answer, even if the upstream payload contains some', () => {
  const r = chat({ no_content_found: true, sources: [src('invented.pdf'), src('other.docx')] });
  assert.equal(r.grounded, false); assert.deepEqual(r.sources, []);
});

test('an answer with no sources is not presented as grounded even if no_content_found is false', () => {
  const r = chat({ no_content_found: false, sources: [] });
  assert.equal(r.grounded, false); assert.deepEqual(r.sources, []);
});

test('splitSummary separates the advice section and keeps the grounded part untouched', () => {
  const s = '## Key Concepts\n- cells\n\n## Important Definitions\n- Osmosis: x\n\n## General study advice (not from your documents)\n- Use spaced repetition\n- Test yourself';
  const r = splitSummary(s);
  assert.equal(r.content, '## Key Concepts\n- cells\n\n## Important Definitions\n- Osmosis: x');
  assert.equal(r.advice, '- Use spaced repetition\n- Test yourself');
  assert.doesNotMatch(r.content, /spaced repetition|General study advice/i);
});

test('splitSummary treats a legacy "Exam Tips" section as advice, case-insensitively, at any heading level', () => {
  for (const h of ['## Exam Tips', '### exam tips', '# EXAM TIPS:']) {
    const r = splitSummary(`## Key Concepts\n- a\n\n${h}\n- Do not confuse osmosis with diffusion`);
    assert.equal(r.content, '## Key Concepts\n- a'); assert.match(r.advice, /diffusion/);
  }
});

test('a sentence that merely mentions exam tips is not mistaken for the advice section', () => {
  const s = '## Key Concepts\n- The lecturer shared exam tips in week 3\n- General study advice was not given';
  const r = splitSummary(s);
  assert.equal(r.advice, null); assert.equal(r.content, s);
});

test('summary without an advice section has advice null; an empty advice section yields null, not an empty box', () => {
  assert.equal(splitSummary('## Key Concepts\n- a').advice, null);
  assert.equal(splitSummary('## Key Concepts\n- a\n\n## General study advice (not from your documents)\n').advice, null);
});

test('mapSummary exposes content and advice separately and rejects an advice-only summary', () => {
  const ok = mapSummary({ id: 'x', content: '## Key Concepts\n- a\n\n## General study advice (not from your documents)\n- Rest', source_doc_count: 2 });
  assert.equal(ok.content, '## Key Concepts\n- a'); assert.equal(ok.advice, '- Rest'); assert.equal(ok.source_doc_count, 2);
  assert.equal(mapSummary({ id: 'x', content: '## General study advice (not from your documents)\n- Rest' }), null);
  assert.equal(mapSummary({ id: 'x', content: '   ' }), null);
});
