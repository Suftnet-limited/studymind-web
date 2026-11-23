import { redirect } from 'next/navigation';

/** Legacy route — all registration now lives at /my-learning/register */
export default function SignUpPage() {
  redirect('/my-learning/register');
}
