import { aiRoute } from '@/lib/learning-ai-proxy';
import { mapQuizResult, parseQuizSubmit } from '@/lib/learning-ai.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Submits answers for a quiz attempt owned by the caller (the AI backend enforces attempt ownership). */
export const POST = aiRoute({
  parse: parseQuizSubmit,
  path: ({ attemptId }) => `/api/quiz/${attemptId}/submit`,
  build: (_moduleId, input) => ({ answers: input.answers }),
  map: mapQuizResult,
});
