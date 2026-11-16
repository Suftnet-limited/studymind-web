import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://2407894ac91f57ee548f59dfcf376722@o1256799.ingest.us.sentry.io/4512276582694912',
  tracesSampleRate: 0.2,
  environment: process.env.NODE_ENV,
});
