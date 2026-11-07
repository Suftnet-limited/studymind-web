'use client';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';
export function useAuthSubmit(mode: 'login'|'register') {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => authService.submit(mode, new FormData(form)),
    onSuccess: () => { router.push('/dashboard'); router.refresh(); },
  });
  return { submit: mutation.mutate, busy: mutation.isPending, error: mutation.error?.message || '' };
}
