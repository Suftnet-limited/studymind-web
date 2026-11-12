import { sessionList, type SessionContext } from '@/lib/learning-ai-proxy';
export const runtime = 'nodejs';

/** The caller's own chats for this module (most recent first). Requires access to the module. */
export const GET = (_request: Request, context: SessionContext) => sessionList(context);
