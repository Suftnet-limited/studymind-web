import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, dashboardStats, firstName, formatDate, matchesSearch, moduleIconKind, paginate, progressState, sortModules, statusOf } from '../src/lib/dashboard.mjs';

const m = (title, extra = {}) => ({ id: title, title, status: 'active', access_type: 'personal', progress: 0, document_count: 0, student_count: 0, created_at: '2026-11-12T10:00:00Z', ...extra });

test('progress states follow the backend definition (10 study activities = 100%)', () => {
  assert.equal(progressState(0), 'not_started'); assert.equal(progressState(35), 'in_progress'); assert.equal(progressState(100), 'completed');
  assert.equal(progressState(undefined), 'not_started'); assert.equal(progressState('x'), 'not_started');
});

test('status: owned modules say Active; enrolled ones show the learner\'s progress; archived wins', () => {
  assert.deepEqual(statusOf(m('a'), true), { key: 'active', label: 'Active', tone: 'green' });
  assert.equal(statusOf(m('a', { progress: 0 }), false).label, 'Not Started');
  assert.equal(statusOf(m('a', { progress: 35 }), false).label, 'In Progress');
  assert.equal(statusOf(m('a', { progress: 100 }), false).label, 'Completed');
  assert.equal(statusOf(m('a', { status: 'archived', progress: 50 }), false).label, 'Archived');
});

test('stats: learners see progress counts, lecturers see class totals; archived modules do not count as in progress', () => {
  const s = dashboardStats([m('x', { access_type: 'class', student_count: 4, document_count: 3 }), m('y', { document_count: 2, student_count: 9 })],
    [m('e1', { progress: 35 }), m('e2'), m('e3', { progress: 100 }), m('e4', { progress: 20, status: 'archived' })]);
  assert.deepEqual(s, { owned: 2, enrolled: 4, inProgress: 1, completed: 1, classModules: 1, students: 4, materials: 5 });
});

test('search is case-insensitive on the title and blank shows everything', () => {
  assert.equal(matchesSearch(m('Year 5 Mathematics'), 'MATH'), true); assert.equal(matchesSearch(m('Biology'), 'math'), false);
  assert.equal(matchesSearch(m('Biology'), '  '), true); assert.equal(matchesSearch(m('Biology'), undefined), true);
});

test('sorting by name, date and status; no sort keeps the server order; input is not mutated', () => {
  const list = [m('b', { created_at: '2026-11-10T00:00:00Z' }), m('a', { created_at: '2026-11-12T00:00:00Z' }), m('c', { created_at: '2026-11-11T00:00:00Z' })];
  const before = list.map((x) => x.title);
  assert.deepEqual(sortModules(list, null), list);
  assert.deepEqual(sortModules(list, { by: 'name', dir: 'asc' }).map((x) => x.title), ['a', 'b', 'c']);
  assert.deepEqual(sortModules(list, { by: 'name', dir: 'desc' }).map((x) => x.title), ['c', 'b', 'a']);
  assert.deepEqual(sortModules(list, { by: 'date', dir: 'asc' }).map((x) => x.title), ['b', 'c', 'a']);
  assert.deepEqual(sortModules(list, { by: 'date', dir: 'desc' }, { dateKey: 'created_at' }).map((x) => x.title), ['a', 'c', 'b']);
  const enrolled = [m('p', { enrolled_at: '2026-11-12T00:00:00Z' }), m('q', { enrolled_at: '2026-11-09T00:00:00Z' }), m('r')];
  assert.deepEqual(sortModules(enrolled, { by: 'date', dir: 'asc' }, { dateKey: 'enrolled_at', owned: false }).map((x) => x.title), ['r', 'q', 'p'], 'a missing date sorts first');
  const st = [m('a', { progress: 100 }), m('b', { progress: 0 }), m('c', { progress: 20 })];
  assert.deepEqual(sortModules(st, { by: 'status', dir: 'asc' }, { owned: false }).map((x) => x.title), ['a', 'c', 'b']);
  assert.deepEqual(list.map((x) => x.title), before);
});

test('paging: five per page, the page number is clamped', () => {
  assert.equal(PAGE_SIZE, 5);
  const list = Array.from({ length: 12 }, (_, i) => i);
  assert.deepEqual(paginate(list, 1), { page: 1, pages: 3, items: [0, 1, 2, 3, 4] });
  assert.deepEqual(paginate(list, 3).items, [10, 11]); assert.equal(paginate(list, 9).page, 3); assert.equal(paginate(list, -2).page, 1);
  assert.deepEqual(paginate([], 1), { page: 1, pages: 1, items: [] });
});

test('names, dates and icons', () => {
  assert.equal(firstName('  UAT Student '), 'UAT'); assert.equal(firstName(''), ''); assert.equal(firstName(null), '');
  assert.equal(formatDate('2026-11-12T10:00:00Z'), '12 Nov 2026'); assert.equal(formatDate('nope'), ''); assert.equal(formatDate(undefined), '');
  const kinds = { 'Year 5 Mathematics Curriculum (England)': 'maths', 'Introduction to Biology': 'biology', 'Introduction to Computer Science': 'code', 'Abel CV': 'document', 'Organic Chemistry': 'chemistry', 'Physics 201': 'physics', 'History 110': 'humanities', 'English Literature': 'language', 'Something else': 'book' };
  for (const [t, k] of Object.entries(kinds)) assert.equal(moduleIconKind(t), k, t);
});
