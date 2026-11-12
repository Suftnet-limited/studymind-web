import { ApiError } from '@/services/studymind-modules.service';
import type { Outline, HistoryDetail, HistoryKind, HistoryRow, ChatResult, ChatSessionDetail, ChatSessionSummary, Complexity, FlashcardDeck, QuizGenerated, QuizResult, Scope, SummaryResult } from '@/lib/learning-ai.mjs';

async function data<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof body.error === 'string' ? body.error : fallback, response.status);
  return body as T;
}
const post = (moduleId: string, path: string, body: unknown) =>
  fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin',
  });

/** Browser client for the AI study tools. Identity and module access are decided server-side from the session cookie. */
export const studyMindAiService = {
  chat: async (moduleId: string, input: { message: string; session_id?: string | null; complexity: Complexity; scope_mode?: Scope }) =>
    data<ChatResult>(await post(moduleId, 'chat', { ...input, session_id: input.session_id ?? undefined }), 'The AI Tutor could not answer'),
  listChats: async (moduleId: string) =>
    data<ChatSessionSummary[]>(await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/sessions`, { credentials: 'same-origin', cache: 'no-store' }), 'Unable to load your chats'),
  openChat: async (moduleId: string, sessionId: string) =>
    data<ChatSessionDetail>(await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/sessions/${encodeURIComponent(sessionId)}`, { credentials: 'same-origin', cache: 'no-store' }), 'Unable to open this chat'),
  deleteChat: async (moduleId: string, sessionId: string) => {
    const response = await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(typeof body.error === 'string' ? body.error : 'Unable to delete this chat', response.status); }
  },
  outline: async (moduleId: string) =>
    data<Outline>(await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/outline`, { credentials: 'same-origin', cache: 'no-store' }), 'Unable to load topic suggestions'),
  listHistory: async (moduleId: string, kind: HistoryKind) =>
    data<HistoryRow[]>(await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/history/${kind}`, { credentials: 'same-origin', cache: 'no-store' }), 'Unable to load your saved items'),
  openHistory: async (moduleId: string, kind: HistoryKind, itemId: string) =>
    data<HistoryDetail>(await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/history/${kind}/${encodeURIComponent(itemId)}`, { credentials: 'same-origin', cache: 'no-store' }), 'Unable to open this item'),
  deleteHistory: async (moduleId: string, kind: HistoryKind, itemId: string) => {
    const response = await fetch(`/api/studymind/modules/${encodeURIComponent(moduleId)}/ai/history/${kind}/${encodeURIComponent(itemId)}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(typeof body.error === 'string' ? body.error : 'Unable to delete this item', response.status); }
  },
  generateQuiz: async (moduleId: string, input: { topic?: string; question_count?: number }) =>
    data<QuizGenerated>(await post(moduleId, 'quiz', input), 'Unable to generate a quiz'),
  submitQuiz: async (moduleId: string, attemptId: string, answers: { question_id: string; answer: string }[]) =>
    data<QuizResult>(await post(moduleId, `quiz/${encodeURIComponent(attemptId)}`, { answers }), 'Unable to submit the quiz'),
  generateFlashcards: async (moduleId: string, input: { topic?: string; max_cards?: number }) =>
    data<FlashcardDeck>(await post(moduleId, 'flashcards', input), 'Unable to generate flashcards'),
  summarise: async (moduleId: string, input: { topic?: string }) =>
    data<SummaryResult>(await post(moduleId, 'summary', input), 'Unable to generate a summary'),
};
