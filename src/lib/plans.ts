/** Presentation-only plan data. Purchases and enforcement live elsewhere (AI entitlements + Web payments). */
export type AllowanceKey = 'chats' | 'quizzes' | 'flashcards' | 'summaries';
export const ALLOWANCE_LABELS: Record<AllowanceKey, string> = {
  chats: 'AI chats', quizzes: 'Quizzes', flashcards: 'Flashcard generations', summaries: 'Summaries',
};
export const ALLOWANCE_KEYS = Object.keys(ALLOWANCE_LABELS) as AllowanceKey[];

export const PLANS = [
  { id: 'free', name: 'Free', price: '£0', cadence: 'every month', allowances: { chats: 10, quizzes: 2, flashcards: 2, summaries: 1 }, note: 'Resets monthly' },
  { id: 'plus', name: 'Plus', price: '£3.99', cadence: 'for 28 days', allowances: { chats: 200, quizzes: 30, flashcards: 30, summaries: 15 }, note: 'One payment, no subscription' },
] as const satisfies readonly { id: string; name: string; price: string; cadence: string; allowances: Record<AllowanceKey, number>; note: string }[];

const UNITS: Record<AllowanceKey, [string, string]> = {
  chats: ['AI chat', 'AI chats'], quizzes: ['quiz', 'quizzes'],
  flashcards: ['flashcard generation', 'flashcard generations'], summaries: ['summary', 'summaries'],
};
/** "1 summary", "15 summaries" */
export const allowanceUnit = (key: AllowanceKey, count: number) => UNITS[key][count === 1 ? 0 : 1];
