import { redirect } from 'next/navigation';

/** Short public link (what the QR code encodes) → the join screen inside the learning workspace. */
export default async function JoinShortLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/my-learning/join/${encodeURIComponent(code)}`);
}
