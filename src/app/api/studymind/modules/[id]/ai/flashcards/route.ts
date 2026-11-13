import { aiRoute } from '@/lib/learning-ai-proxy';
import { mapFlashcards, parseFlashcardInput, toFlashcardRequest } from '@/lib/learning-ai.mjs';
export const runtime = 'nodejs';
export const maxDuration = 90;

export const POST = aiRoute({ parse: parseFlashcardInput, path: () => '/api/flashcards/generate', build: toFlashcardRequest, map: mapFlashcards, status: 201 });
