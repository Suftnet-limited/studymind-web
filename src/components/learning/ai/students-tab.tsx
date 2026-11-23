'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StudentRow = { enrolment_id: string; student_id: string; full_name: string; email: string; enrolled_at: string };

const PAGE_SIZE = 50;

function formatDate(iso: string) {
  try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); }
  catch { return iso; }
}

export function StudentsTab({ moduleId, ownerId }: { moduleId: string; ownerId: string }) {
  const cache = useQueryClient();
  const [page, setPage] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const studentsQuery = useQuery<StudentRow[]>({
    queryKey: ['canonical', 'students', moduleId],
    queryFn: async () => {
      const res = await fetch(`/api/studymind/modules/${moduleId}/students`);
      if (!res.ok) throw new Error('Could not load students');
      return res.json();
    },
  });

  const removeStudent = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await fetch(`/api/studymind/modules/${moduleId}/students/${studentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove student');
    },
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['canonical', 'students', moduleId] }); setRemovingId(null); },
  });

  // Filter out the owner (backend returns them as an enrolment)
  const students = (studentsQuery.data ?? []).filter(s => s.student_id !== ownerId);
  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const pageStudents = students.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="min-h-[200px] space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-violet-600" aria-hidden />
          <span className="text-sm font-semibold text-zinc-900">
            {studentsQuery.isLoading ? 'Loading…' : `${students.length} enrolled student${students.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span>Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded p-1 hover:bg-zinc-100 disabled:opacity-30 transition" aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="rounded p-1 hover:bg-zinc-100 disabled:opacity-30 transition" aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Error states */}
      {studentsQuery.isError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Could not load students. <button onClick={() => studentsQuery.refetch()} className="font-semibold underline">Retry</button></p>
      )}
      {removeStudent.isError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Remove failed — please try again.</p>
      )}

      {/* Empty state */}
      {!studentsQuery.isLoading && students.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
          <GraduationCap className="size-8 text-zinc-300" aria-hidden />
          <p className="text-sm font-semibold text-zinc-500">No students enrolled yet</p>
          <p className="text-xs text-zinc-400">Share the Course ID or QR code from the top of this page.</p>
        </div>
      )}

      {/* Table */}
      {pageStudents.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3 whitespace-nowrap">Date joined</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pageStudents.map((s, idx) => (
                <tr key={s.student_id} className={cn('transition', idx % 2 === 1 ? 'bg-zinc-50/50' : 'bg-white')}>
                  <td className="px-5 py-3.5 font-medium text-zinc-900 whitespace-nowrap">{s.full_name}</td>
                  <td className="px-5 py-3.5 text-zinc-500">{s.email}</td>
                  <td className="px-5 py-3.5 text-zinc-400 whitespace-nowrap">{formatDate(s.enrolled_at)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {removingId === s.student_id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs font-semibold text-red-700">Remove?</span>
                        <button onClick={() => removeStudent.mutate(s.student_id)} disabled={removeStudent.isPending}
                          className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-60">Yes</button>
                        <button onClick={() => setRemovingId(null)} className="text-xs text-zinc-400 hover:text-zinc-700">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setRemovingId(s.student_id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition">
                        <UserMinus className="size-3.5" aria-hidden /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1 text-xs text-zinc-500">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, students.length)} of {students.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(0)} disabled={page === 0}
              className="rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-30 transition">First</button>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-30 transition">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-30 transition">Next</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
              className="rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-30 transition">Last</button>
          </div>
        </div>
      )}
    </div>
  );
}
