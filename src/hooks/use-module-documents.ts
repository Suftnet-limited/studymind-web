'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { moduleService } from '@/services/module.service';
import { moduleKeys } from '@/services/query-keys';
export function useModuleUpload(moduleId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => moduleService.upload(moduleId, new FormData(form)),
    onSuccess: (_data, form) => { form.reset(); void queryClient.invalidateQueries({ queryKey: moduleKeys.indexing(moduleId) }); router.refresh(); },
  });
  return { upload: mutation.mutateAsync, busy: mutation.isPending, message: mutation.isPending ? 'Uploading document…' : mutation.isSuccess ? 'Document uploaded. AI indexing is in progress.' : mutation.error?.message || '' };
}
export function useModuleIndexing(moduleId: string) {
  const query = useQuery({
    queryKey: moduleKeys.indexing(moduleId),
    queryFn: ({ signal }) => moduleService.indexingStatus(moduleId, signal),
    refetchInterval: 10000,
  });
  return { docs: query.data || [], error: query.error?.message || '', refresh: () => void query.refetch() };
}
