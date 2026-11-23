import { redirect } from 'next/navigation';

/** Legacy route — all sign-in now lives at /my-learning */
export default function SignInPage() {
  redirect('/my-learning');
}
