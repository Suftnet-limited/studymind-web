'use client';
import { useMutation } from '@tanstack/react-query';
import { moduleService } from '@/services/module.service';
export function useModuleEnrolment() {
  const mutation = useMutation({ mutationFn: (courseId: string) => moduleService.join(courseId.trim()), onSuccess: destination => window.location.assign(destination) });
  return { join: mutation.mutate, busy: mutation.isPending, error: mutation.error?.message || '' };
}
