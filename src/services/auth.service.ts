export const authService = {
  async submit(mode: 'login' | 'register', data: FormData, recaptchaToken: string) {
    if (recaptchaToken) data.append('recaptchaToken', recaptchaToken);
    const res = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST', body: data, redirect: 'follow',
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || 'Unable to complete request');
    }
  },
};
