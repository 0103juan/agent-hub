import { ConversationSession } from './types';

/** Nombre con el que un agente se identifica ante sus compañeros. */
export function agentName(session: ConversationSession): string {
  return session.taskSlug ?? session.title;
}
