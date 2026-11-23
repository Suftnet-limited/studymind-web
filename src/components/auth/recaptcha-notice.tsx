/** Google's required attribution for reCAPTCHA v3. Shown on every page that runs it, in case the badge is hidden or blocked. */
export function RecaptchaNotice() {
  return <p className="mt-4 text-center text-[11px] leading-4 text-slate-400" data-testid="recaptcha-notice">
    This site is protected by reCAPTCHA and the Google{' '}
    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a> and{' '}
    <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a> apply.
  </p>;
}
