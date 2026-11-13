import type { ReactNode } from 'react';

// Navigation (My modules, Plans, AI access) lives in the site header; every link there works with the StudyMind sign-in alone.
export default function MyLearningLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
