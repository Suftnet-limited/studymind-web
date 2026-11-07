CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
