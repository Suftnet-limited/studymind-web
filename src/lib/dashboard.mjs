// Pure helpers for the learner dashboard (src/components/learning/dashboard.tsx): derived status, search, sort and paging.

export const PAGE_SIZE = 5;

/** Study progress is the share of 10 logged study activities (the backend's own definition), so 0 = not started, 100 = completed. */
export function progressState(progress) {
  const p = Number.isFinite(progress) ? progress : 0;
  return p >= 100 ? 'completed' : p > 0 ? 'in_progress' : 'not_started';
}

/** The label and tone shown in the Status column. Owned modules show their own state; enrolled ones show the learner's progress. */
export function statusOf(module, owned) {
  if (module.status && module.status !== 'active') return { key: module.status, label: module.status.charAt(0).toUpperCase() + module.status.slice(1), tone: 'muted' };
  if (owned) return { key: 'active', label: 'Active', tone: 'green' };
  const s = progressState(module.progress);
  return s === 'completed' ? { key: s, label: 'Completed', tone: 'green' } : s === 'in_progress' ? { key: s, label: 'In Progress', tone: 'amber' } : { key: s, label: 'Not Started', tone: 'muted' };
}

export function dashboardStats(owned, enrolled) {
  const activeEnrolled = enrolled.filter((m) => !m.status || m.status === 'active');
  return {
    owned: owned.length,
    enrolled: enrolled.length,
    inProgress: activeEnrolled.filter((m) => progressState(m.progress) === 'in_progress').length,
    completed: activeEnrolled.filter((m) => progressState(m.progress) === 'completed').length,
    classModules: owned.filter((m) => m.access_type === 'class').length,
    students: owned.reduce((n, m) => n + (m.access_type === 'class' ? Number(m.student_count) || 0 : 0), 0),
    materials: owned.reduce((n, m) => n + (Number(m.document_count) || 0), 0),
  };
}

export const matchesSearch = (module, query) => { const q = String(query ?? '').trim().toLowerCase(); return !q || String(module.title ?? '').toLowerCase().includes(q); };

const SORTERS = {
  name: (a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, { sensitivity: 'base' }),
  date: (a, b, key) => (Date.parse(a[key] ?? '') || 0) - (Date.parse(b[key] ?? '') || 0),
  status: (a, b, key, owned) => statusOf(a, owned).label.localeCompare(statusOf(b, owned).label),
};
/** `sort` is null (the server's order) or { by: 'name' | 'date' | 'status', dir: 'asc' | 'desc' }. `dateKey` is created_at or enrolled_at. */
export function sortModules(list, sort, { dateKey = 'created_at', owned = true } = {}) {
  if (!sort) return list;
  const f = SORTERS[sort.by]; if (!f) return list;
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => sign * f(a, b, dateKey, owned));
}

export function paginate(list, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, pages, items: list.slice((current - 1) * size, current * size) };
}

export const firstName = (full) => String(full ?? '').trim().split(/\s+/)[0] || '';

export const formatDate = (iso) => { const d = new Date(iso ?? ''); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

/** Which icon a module gets, from its title (the emoji, when the module has one, wins in the UI). */
export function moduleIconKind(title) {
  const t = String(title ?? '').toLowerCase();
  if (/math|algebra|geometry|calcul|statistic|number/.test(t)) return 'maths';
  if (/bio|life science|anatomy|ecolog/.test(t)) return 'biology';
  if (/chem/.test(t)) return 'chemistry';
  if (/physic|mechanic|engineer/.test(t)) return 'physics';
  if (/comput|program|software|code|data|algorithm|network|\bit\b|cyber/.test(t)) return 'code';
  if (/histor|geograph|politic|econom|business|law/.test(t)) return 'humanities';
  if (/english|literat|language|writing|poetry|french|spanish/.test(t)) return 'language';
  if (/\bcv\b|resume|résumé|cover letter|notes|document/.test(t)) return 'document';
  return 'book';
}
