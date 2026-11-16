'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { logEvent } from 'firebase/analytics';
import { analyticsPromise } from '@/lib/firebase';

export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    analyticsPromise.then((analytics) => {
      if (!analytics) return;
      logEvent(analytics, 'page_view', {
        page_path: pathname,
        page_search: searchParams.toString(),
        page_location: window.location.href,
      });
    }).catch(() => {});
  }, [pathname, searchParams]);

  return null;
}
