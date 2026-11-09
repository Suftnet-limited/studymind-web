import { ApiError } from '@/services/studymind-modules.service';
import type { ChatResult, Complexity, FlashcardDeck, QuizGenerated, QuizResult, SummaryResult } from '@/lib/learning-ai.mjs';

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
  chat: async (moduleId: string, input: { message: string; session_id?: string | null; complexity: Complexity }) =>
    data<ChatResult>(await post(moduleId, 'chat', { ...input, session_id: input.session_id ?? undefined }), 'The AI Tutor could not answer'),
  generateQuiz: async (moduleId: string, input: { topic?: string; question_count?: number }) =>
    data<QuizGenerated>(await post(moduleId, 'quiz', input), 'Unable to generate a quiz'),
  submitQuiz: async (moduleId: string, attemptId: string, answers: { question_id: string; answer: string }[]) =>
    data<QuizResult>(await post(moduleId, `quiz/${encodeURIComponent(attemptId)}`, { answers }), 'Unable to submit the quiz'),
  generateFlashcards: async (moduleId: string, input: { topic?: string; max_cards?: number }) =>
    data<FlashcardDeck>(await post(moduleId, 'flashcards', input), 'Unable to generate flashcards'),
  summarise: async (moduleId: string, input: { topic?: string }) =>
    data<SummaryResult>(await post(moduleId, 'summary', input), 'Unable to generate a summary'),
};
