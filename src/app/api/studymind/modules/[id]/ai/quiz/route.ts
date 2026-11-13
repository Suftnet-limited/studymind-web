import { aiRoute } from '@/lib/learning-ai-proxy';
import { mapQuizGenerated, parseQuizInput, toQuizRequest } from '@/lib/learning-ai.mjs';
export const runtime = 'nodejs';
export const maxDuration = 90;

/** Generates a multiple-choice quiz. Correct answers and explanations are withheld until the quiz is submitted. */
export const POST = aiRoute({ parse: parseQuizInput, path: () => '/api/quiz/generate', build: toQuizRequest, map: mapQuizGenerated, status: 201 });
