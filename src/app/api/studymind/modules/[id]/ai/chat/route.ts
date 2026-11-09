import { aiRoute } from '@/lib/learning-ai-proxy';
import { mapChat, parseChatInput, toChatRequest } from '@/lib/learning-ai.mjs';
export const runtime = 'nodejs';
export const maxDuration = 90;

/** AI Tutor: ask a question about this module. Answers are grounded in the module's class material plus the caller's own notes. */
export const POST = aiRoute({ parse: parseChatInput, path: () => '/api/chat', build: toChatRequest, map: mapChat });
