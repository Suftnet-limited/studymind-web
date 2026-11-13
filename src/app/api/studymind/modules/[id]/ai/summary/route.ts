import { aiRoute } from '@/lib/learning-ai-proxy';
import { mapSummary, parseSummaryInput, toSummaryRequest } from '@/lib/learning-ai.mjs';
export const runtime = 'nodejs';
export const maxDuration = 90;

export const POST = aiRoute({ parse: parseSummaryInput, path: () => '/api/summarise', build: toSummaryRequest, map: mapSummary, status: 201 });
