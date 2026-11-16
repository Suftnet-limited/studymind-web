import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // serverBodySizeLimit is not needed: uploads now go browser → backend directly,
  // bypassing Render entirely.
};

export default withSentryConfig(nextConfig, {
  org: 'o1256799',
  project: 'revvo',
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
