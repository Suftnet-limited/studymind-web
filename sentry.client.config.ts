import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://2407894ac91f57ee548f59dfcf376722@o1256799.ingest.us.sentry.io/4512276582694912',
  tracesSampleRate: 0.2,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],
  environment: process.env.NODE_ENV,
});
