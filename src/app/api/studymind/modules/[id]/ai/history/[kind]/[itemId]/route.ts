import { historyDelete, historyOpen, type HistoryContext } from '@/lib/learning-ai-proxy';
export const runtime = 'nodejs';

/** One saved quiz, flashcard set or summary of the caller's FOR THIS MODULE. */
export const GET = (_request: Request, context: HistoryContext) => historyOpen(context);
/** Permanently deletes one of the caller's own saved items for this module. */
export const DELETE = (request: Request, context: HistoryContext) => historyDelete(request, context);
