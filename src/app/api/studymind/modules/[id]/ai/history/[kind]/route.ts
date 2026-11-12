import { historyList, type HistoryContext } from '@/lib/learning-ai-proxy';
export const runtime = 'nodejs';

/** The caller's own saved quizzes, flashcard sets or summaries for this module (newest first). Requires access to the module. */
export const GET = (_request: Request, context: HistoryContext) => historyList(context);
