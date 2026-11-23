'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { ApiError } from '@/services/studymind-modules.service';
import { roleCapabilities } from '@/lib/studymind-validation.mjs';
import { isJoinCode } from '@/lib/join-link';
import { withNext } from '@/lib/return-to';
import { JoinCourse } from '@/components/learning/dashboard';
import { ErrorBox, LoadingBlock } from '@/components/learning/states';

/** Landing page for a scanned QR code or shared link: shows the course for confirmation, then enrols the student. */
export default function JoinByCodePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  let code = '';
  try { code = decodeURIComponent(params.code ?? '').trim(); } catch { /* malformed escape → treated as invalid below */ }
  const valid = isJoinCode(code);
  const back = `/my-learning/join/${encodeURIComponent(code)}`;   // where sign-in / registration return to

  const overview = useQuery({
    queryKey: ['canonical', 'overview'], queryFn: studyMindIdentityService.overview, enabled: valid,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
  });
  const signedOut = overview.error instanceof ApiError && overview.error.status === 401;
  const role = overview.data?.user.role ?? '';

  return <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-extrabold tracking-tight text-[#111034]">Join a course</h1>
    {!valid && <div className="mt-6"><ErrorBox message="This join link isn’t valid. Ask your lecturer for the code and enter it from My modules." /></div>}
    {valid && overview.isLoading && <LoadingBlock label="Checking your account…" />}
    {valid && signedOut && <div data-testid="join-signed-out" className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/50 p-6">
      <p className="text-sm text-zinc-600">Sign in or create a student account and you’ll come straight back here to join:</p>
      <p className="mt-3 text-3xl font-extrabold tracking-wider text-violet-700">{code}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={withNext('/my-learning', back)} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Sign in</Link>
        <Link href={withNext('/my-learning/register', back)} className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50">Create an account</Link>
      </div>
    </div>}
    {valid && overview.isError && !signedOut && <div className="mt-6"><ErrorBox message="We couldn’t check your account. Please try again." onRetry={() => overview.refetch()} /></div>}
    {valid && overview.data && !roleCapabilities(role).canJoin && <div className="mt-6"><ErrorBox message="Only student accounts can join a course. Open this link while signed in as a student." /></div>}
    {valid && overview.data && roleCapabilities(role).canJoin && <div className="mt-6">
      <JoinCourse initialCode={code} onJoined={moduleId => router.push(`/my-learning/modules/${moduleId}`)} />
    </div>}
  </main>;
}
