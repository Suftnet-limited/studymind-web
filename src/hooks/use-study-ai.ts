'use client';
import { useMutation } from '@tanstack/react-query';
import { moduleService } from '@/services/module.service';
export function useStudyAi(moduleId: string) {
  const mutation = useMutation({ mutationFn: ({ operation, payload }: { operation: string; payload?: Record<string, unknown> }) => moduleService.ai(moduleId, operation, payload) });
  async function run(operation: string, payload: Record<string,unknown> = {}) {
    try { return await mutation.mutateAsync({ operation, payload }); }
    catch { return null; }
  }
  return { run, busy: mutation.isPending, error: mutation.error?.message || '', clearError: mutation.reset };
}
