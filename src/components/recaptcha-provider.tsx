'use client';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

// Wrap only the pages that submit a protected form (sign-in, sign-up).
// Mounting it loads the reCAPTCHA script and shows the badge, so keep it out of the root layout.
export function RecaptchaProvider({ children }: { children: React.ReactNode }) {
  if (!SITE_KEY) return <>{children}</>;
  return (
    <GoogleReCaptchaProvider reCaptchaKey={SITE_KEY} scriptProps={{ async: true, defer: true }}>
      {children}
    </GoogleReCaptchaProvider>
  );
}
