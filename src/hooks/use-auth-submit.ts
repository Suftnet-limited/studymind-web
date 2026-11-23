'use client';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { getRecaptchaToken } from '@/lib/recaptcha-client';
import { authService } from '@/services/auth.service';

export function useAuthSubmit(mode: 'login' | 'register') {
  const router = useRouter();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const token = await getRecaptchaToken(executeRecaptcha, mode);
      return authService.submit(mode, new FormData(form), token);
    },
    onSuccess: () => { router.push('/dashboard'); router.refresh(); },
  });

  return { submit: mutation.mutate, busy: mutation.isPending, error: mutation.error?.message || '' };
}
