import { moduleOutline } from '@/lib/learning-ai-proxy';
export const runtime = 'nodejs';

/** Topic suggestions for Quiz, Flashcards and Summary: this module's weeks and indexed documents (titles only). */
export const GET = (_request: Request, context: { params: Promise<{ id: string }> }) => moduleOutline(context);
